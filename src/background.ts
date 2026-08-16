import { ingestAccountRecord } from './account/ingest.ts';
import { loadAccountDatabase, resetAccountDatabase, saveAccountDatabase } from './account/storage.ts';
import { CaptureEventBuffer } from './capture/event-buffer.ts';
import { processObservedResponse, ResponseBodyUnavailableError } from './capture/observer.ts';
import { isGbfPageUrl } from './capture/policy.ts';
import { classifyObservedResponseUrl, shouldReadObservedResponse } from './capture/route.ts';
import {
  clearCaptureStorage,
  finishCaptureScan,
  getCaptureScan,
  getLatestCaptureScan,
  saveCapturedResponse,
  startCaptureScan,
} from './capture/storage.ts';
import { isTerminalResult, shouldRetargetObservation } from './capture/target-policy.ts';
import {
  clearCombatParseContext,
  clearCombatStorage,
  getCombatLiveContext,
  ingestCapturedCombatRecord,
} from './combat/storage.ts';
import type { RaidResult } from './combat/types.ts';
import type {
  CaptureMessage,
  CaptureResourceType,
  CaptureStatusResponse,
  CapturedResponseRecord,
  DebuggerResponseBody,
  ObservedResponse,
} from './capture/types.ts';
import { cleanupLocalData, type LocalCleanupMode } from './storage/cleanup.ts';

const DEBUGGER_PROTOCOL_VERSION = '1.3';
const STATE_KEY = 'gbfit:capture-state';
const NETWORK_MAX_TOTAL_BUFFER_SIZE = 32 * 1024 * 1024;
const NETWORK_MAX_RESOURCE_BUFFER_SIZE = 8 * 1024 * 1024;
const CAPTURE_NETWORK_METHODS = new Set([
  'Network.responseReceived',
  'Network.loadingFinished',
  'Network.loadingFailed',
]);
const pendingResponses = new CaptureEventBuffer();
const expectedDetachTabIds = new Set<number>();
let eventQueue: Promise<void> = Promise.resolve();
let accountQueue: Promise<void> = Promise.resolve();
let targetQueue: Promise<void> = Promise.resolve();

type RuntimeState = {
  active: boolean;
  tabId?: number;
  scanId?: string;
  combatTabId?: number;
  combatInstanceId?: string;
  error?: string;
};

type NetworkResponseReceived = {
  requestId: string;
  type?: string;
  response?: {
    url?: string;
    status?: number;
    mimeType?: string;
  };
};

chrome.runtime.onMessage.addListener((message: CaptureMessage, _sender, sendResponse) => {
  if (!message?.type?.startsWith('gbfit:')) return false;

  void handleMessage(message)
    .then(sendResponse)
    .catch((error: unknown) =>
      sendResponse({
        version: 1,
        captureReady: true,
        active: false,
        message: 'Observation error',
        scan: null,
        error: error instanceof Error ? error.message : String(error),
      } satisfies CaptureStatusResponse),
    );
  return true;
});

chrome.debugger.onEvent.addListener((source, method, params) => {
  if (source.tabId === undefined || !CAPTURE_NETWORK_METHODS.has(method)) return;
  eventQueue = eventQueue
    .then(() => handleDebuggerEvent(source.tabId as number, method, params))
    .catch(() => {});
});

chrome.debugger.onDetach.addListener((source, reason) => {
  if (source.tabId === undefined) return;
  if (expectedDetachTabIds.delete(source.tabId)) return;
  void handleUnexpectedDetach(source.tabId, reason);
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  void queueObservationRetarget(tabId);
});

chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;
  void chrome.tabs.query({ active: true, windowId })
    .then(([tab]) => tab?.id === undefined ? undefined : queueObservationRetarget(tab.id))
    .catch(() => {});
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void releaseUnavailableTarget(tabId, 'observed GBF tab closed');
});

async function handleMessage(message: CaptureMessage): Promise<CaptureStatusResponse> {
  switch (message.type) {
    case 'gbfit:start-observation':
      return await startObservation(message.tabId);
    case 'gbfit:stop-observation':
      return await stopObservation();
    case 'gbfit:get-status':
      return await getStatus();
    case 'gbfit:reset-account-data':
      await queueAccountReset();
      return await getStatus();
    case 'gbfit:clear-diagnostic-data':
      await queueLocalCleanup('diagnostic');
      return await getStatus();
    case 'gbfit:clear-all-except-account':
      await queueLocalCleanup('all-except-account');
      return await getStatus();
  }
}

async function queueAccountReset(): Promise<void> {
  accountQueue = accountQueue
    .catch(() => {})
    .then(async () => resetAccountDatabase());
  await accountQueue;
}

async function queueAccountIngest(record: CapturedResponseRecord): Promise<void> {
  accountQueue = accountQueue
    .catch(() => {})
    .then(async () => {
      const current = await loadAccountDatabase();
      const next = ingestAccountRecord(current, record);
      if (!next || next === current) return;
      await saveAccountDatabase(next);
    });
  await accountQueue;
}

async function queueLocalCleanup(mode: LocalCleanupMode): Promise<void> {
  const state = await getRuntimeState();
  if (state.active) throw new Error('Stop observation before clearing local diagnostic data.');
  await cleanupLocalData(mode, {
    clearDiagnostic: clearCaptureStorage,
    clearCombat: clearCombatStorage,
  });
  await setRuntimeState({ active: false });
}

async function startObservation(explicitTabId?: number): Promise<CaptureStatusResponse> {
  const existing = await getRuntimeState();
  if (existing.active) {
    if (explicitTabId !== undefined) await queueObservationRetarget(explicitTabId);
    return await getStatus();
  }

  const tab = await resolveObservationTab(explicitTabId);
  const target = { tabId: tab.id as number };
  const scanId = crypto.randomUUID();
  let scanStarted = false;
  try {
    pendingResponses.clear();
    await clearCombatParseContext();
    await chrome.debugger.attach(target, DEBUGGER_PROTOCOL_VERSION);
    await startCaptureScan(scanId);
    scanStarted = true;
    await setRuntimeState({ active: true, tabId: target.tabId, scanId });
    await enableNetworkObservation(target.tabId);
  } catch (error) {
    if (scanStarted) await finishCaptureScan(scanId);
    await setRuntimeState({ active: false, scanId: scanStarted ? scanId : undefined });
    try {
      await chrome.debugger.detach(target);
    } catch {
      // Nothing to detach.
    }
    throw error;
  }

  return await getStatus();
}

async function resolveObservationTab(explicitTabId?: number): Promise<chrome.tabs.Tab> {
  let tab: chrome.tabs.Tab | undefined;

  if (explicitTabId !== undefined) {
    if (!Number.isInteger(explicitTabId) || explicitTabId < 0) {
      throw new Error('The selected GBF tab is invalid. Re-open the extension from the GBF tab.');
    }
    try {
      tab = await chrome.tabs.get(explicitTabId);
    } catch {
      throw new Error('The selected GBF tab is no longer available. Re-open the extension from the GBF tab.');
    }
  } else {
    [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  }

  if (tab?.id === undefined || !isGbfPageUrl(tab.url)) {
    throw new Error('Open game.granbluefantasy.jp in the active tab before starting observation.');
  }
  return tab;
}

async function stopObservation(): Promise<CaptureStatusResponse> {
  const state = await getRuntimeState();
  if (!state.active || !state.scanId) return await getStatus();

  await setRuntimeState({ active: false, scanId: state.scanId });
  pendingResponses.clear();
  await finishCaptureScan(state.scanId);
  await clearCombatParseContext();
  if (state.tabId !== undefined) {
    try {
      await chrome.debugger.detach({ tabId: state.tabId });
    } catch {
      // Already detached or tab closed; the scan has still been finalized locally.
    }
  }
  return await getStatus();
}

function queueObservationRetarget(candidateTabId: number): Promise<void> {
  targetQueue = targetQueue
    .catch(() => {})
    .then(() => retargetObservation(candidateTabId));
  return targetQueue.catch(() => {});
}

async function retargetObservation(candidateTabId: number): Promise<void> {
  let state = await getRuntimeState();
  if (!state.scanId || !shouldRetargetObservation(state, candidateTabId)) return;
  if (!await isVerifiedGbfTab(candidateTabId)) return;

  state = await getRuntimeState();
  if (!state.scanId || !shouldRetargetObservation(state, candidateTabId)) return;
  await switchObservationTarget(state, candidateTabId);
}

async function switchObservationTarget(state: RuntimeState, candidateTabId: number): Promise<void> {
  if (!state.scanId) return;
  const previousTabId = state.tabId;

  pendingResponses.clear();
  await clearCombatParseContext();
  await setRuntimeState({ active: true, scanId: state.scanId });

  if (previousTabId !== undefined) {
    expectedDetachTabIds.add(previousTabId);
    try {
      await chrome.debugger.detach({ tabId: previousTabId });
    } catch (error) {
      expectedDetachTabIds.delete(previousTabId);
      await setRuntimeState({
        active: true,
        tabId: previousTabId,
        scanId: state.scanId,
        error: `Could not switch observation target: ${error instanceof Error ? error.message : String(error)}`,
      });
      return;
    }
  }

  if (!await isVerifiedGbfTab(candidateTabId)) {
    await setRuntimeState({
      active: true,
      scanId: state.scanId,
      error: 'Observation is waiting for an active verified GBF tab.',
    });
    return;
  }

  try {
    await chrome.debugger.attach({ tabId: candidateTabId }, DEBUGGER_PROTOCOL_VERSION);
    await enableNetworkObservation(candidateTabId);
    await setRuntimeState({ active: true, tabId: candidateTabId, scanId: state.scanId });
  } catch (error) {
    await setRuntimeState({
      active: true,
      scanId: state.scanId,
      error: `Could not switch observation target: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

async function enableNetworkObservation(tabId: number): Promise<void> {
  await chrome.debugger.sendCommand({ tabId }, 'Network.enable', {
    maxTotalBufferSize: NETWORK_MAX_TOTAL_BUFFER_SIZE,
    maxResourceBufferSize: NETWORK_MAX_RESOURCE_BUFFER_SIZE,
  });
}

async function isVerifiedGbfTab(tabId: number): Promise<boolean> {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (isGbfPageUrl(tab.url)) return true;
  } catch {
    return false;
  }

  try {
    const targets = await chrome.debugger.getTargets();
    const target = targets.find((candidate) => candidate.tabId === tabId);
    return isGbfPageUrl(target?.url);
  } catch {
    return false;
  }
}

async function retargetToFocusedGbfTab(): Promise<void> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tab?.id !== undefined) await queueObservationRetarget(tab.id);
  } catch {
    // Observation stays logically active until another verified GBF tab becomes active.
  }
}

async function releaseUnavailableTarget(tabId: number, reason: string): Promise<void> {
  const state = await getRuntimeState();
  if (
    !state.active ||
    !state.scanId ||
    (state.tabId !== tabId && state.combatTabId !== tabId)
  ) return;

  pendingResponses.clear();
  await clearCombatParseContext();
  await setRuntimeState({
    active: true,
    scanId: state.scanId,
    error: `Observation target released: ${reason}.`,
  });

  if (state.tabId === tabId) {
    expectedDetachTabIds.add(tabId);
    try {
      await chrome.debugger.detach({ tabId });
    } catch {
      expectedDetachTabIds.delete(tabId);
    }
  }
  void retargetToFocusedGbfTab();
}

async function handleDebuggerEvent(
  tabId: number,
  method: string,
  params: object | undefined,
): Promise<void> {
  if (method === 'Network.loadingFailed') {
    const requestId = (params as { requestId?: string } | undefined)?.requestId;
    if (requestId) pendingResponses.forget(requestId);
    return;
  }

  if (method === 'Network.responseReceived') {
    const event = params as NetworkResponseReceived | undefined;
    const resourceType = normalizeResourceType(event?.type);
    const url = event?.response?.url;
    const requestId = event?.requestId;
    if (!url || !requestId || !shouldReadObservedResponse(url, resourceType)) return;

    const state = await getRuntimeState();
    if (!state.active || state.tabId !== tabId || !state.scanId) return;

    pendingResponses.remember({
      requestId,
      url,
      status: event.response?.status,
      mimeType: event.response?.mimeType,
      resourceType,
    });
    return;
  }

  if (method !== 'Network.loadingFinished') return;
  const requestId = (params as { requestId?: string } | undefined)?.requestId;
  if (!requestId) return;
  const meta = pendingResponses.take(requestId);
  if (!meta || !shouldReadObservedResponse(meta.url, meta.resourceType)) return;

  const state = await getRuntimeState();
  if (!state.active || state.tabId !== tabId || !state.scanId) return;
  void captureObservedResponse(tabId, state.scanId, meta);
}

async function captureObservedResponse(tabId: number, scanId: string, meta: ObservedResponse): Promise<void> {
  try {
    await processObservedResponse(
      meta,
      scanId,
      {
        getResponseBody: async (id): Promise<DebuggerResponseBody> =>
          (await chrome.debugger.sendCommand(
            { tabId },
            'Network.getResponseBody',
            { requestId: id },
          )) as DebuggerResponseBody,
      },
      async (record) => saveObservedResponse(tabId, record),
    );
    await clearObservationReadWarning(tabId, scanId);
  } catch (error) {
    await recordObservationReadWarning(tabId, scanId, meta.url, error);
  }
}

async function saveObservedResponse(tabId: number, record: CapturedResponseRecord): Promise<void> {
  const route = classifyObservedResponseUrl(record.meta.url);
  if (route === 'combat') {
    const parse = await ingestCapturedCombatRecord(record);
    const context = parse ? await getCombatLiveContext() : undefined;
    if (parse && context?.instanceId) {
      await updateCombatLock(tabId, context.instanceId, parse.result);
    }
    return;
  }
  if (route !== 'account') return;

  await queueAccountIngest(record);
  await saveCapturedResponse(record);
}

async function updateCombatLock(tabId: number, instanceId: string, result: RaidResult): Promise<void> {
  const current = await getRuntimeState();
  if (!current.active || current.tabId !== tabId || !current.scanId) return;

  if (result === 'active') {
    if (current.combatTabId === tabId && current.combatInstanceId === instanceId) return;
    await setRuntimeState({
      ...current,
      combatTabId: tabId,
      combatInstanceId: instanceId,
    });
    return;
  }

  if (
    !isTerminalResult(result) ||
    current.combatTabId !== tabId ||
    current.combatInstanceId !== instanceId
  ) return;

  const next = { ...current };
  delete next.combatTabId;
  delete next.combatInstanceId;
  await setRuntimeState(next);
  void retargetToFocusedGbfTab();
}

async function recordObservationReadWarning(
  tabId: number,
  scanId: string,
  url: string,
  error: unknown,
): Promise<void> {
  const current = await getRuntimeState();
  if (!current.active || current.tabId !== tabId || current.scanId !== scanId) return;

  const path = safeObservedPath(url);
  const reason = error instanceof ResponseBodyUnavailableError
    ? 'Edge did not expose the completed response body after three debugger reads.'
    : 'Local processing of the observed response failed.';
  await setRuntimeState({
    ...current,
    error: `Allowlisted response skipped (${path}): ${reason}`,
  });
}

async function clearObservationReadWarning(tabId: number, scanId: string): Promise<void> {
  const current = await getRuntimeState();
  if (
    !current.active ||
    current.tabId !== tabId ||
    current.scanId !== scanId ||
    !current.error?.startsWith('Allowlisted response skipped (')
  ) return;
  const next = { ...current };
  delete next.error;
  await setRuntimeState(next);
}

function safeObservedPath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return 'verified GBF response';
  }
}

async function handleUnexpectedDetach(tabId: number, reason: string): Promise<void> {
  const state = await getRuntimeState();
  if (!state.active || state.tabId !== tabId || !state.scanId) return;

  pendingResponses.clear();
  await clearCombatParseContext();
  if (reason === 'canceled_by_user') {
    await finishCaptureScan(state.scanId);
    await setRuntimeState({
      active: false,
      scanId: state.scanId,
      error: `Observation stopped: ${reason}`,
    });
    return;
  }

  await setRuntimeState({
    active: true,
    scanId: state.scanId,
    error: `Observation target detached: ${reason}.`,
  });
  void retargetToFocusedGbfTab();
}

function normalizeResourceType(type: string | undefined): CaptureResourceType {
  if (type === 'XHR') return 'xhr';
  if (type === 'Fetch') return 'fetch';
  if (type === 'Document') return 'document';
  return 'other';
}

async function getStatus(): Promise<CaptureStatusResponse> {
  const state = await getRuntimeState();
  const scan = state.scanId
    ? await getCaptureScan(state.scanId)
    : await getLatestCaptureScan();
  return {
    version: 1,
    captureReady: true,
    active: state.active,
    message: state.active
      ? state.tabId !== undefined
        ? 'Debugger observation is active. Only allowlisted GBF responses are read.'
        : 'Observation is active and waiting for an active verified GBF tab.'
      : scan
        ? 'Observation is stopped. Start it again to update account or combat data.'
        : 'Account tracking is inactive. Start observation to collect allowlisted responses.',
    scan,
    error: state.error,
  };
}

async function getRuntimeState(): Promise<RuntimeState> {
  const stored = await chrome.storage.session.get(STATE_KEY);
  return (stored[STATE_KEY] as RuntimeState | undefined) ?? { active: false };
}

async function setRuntimeState(state: RuntimeState): Promise<void> {
  await chrome.storage.session.set({ [STATE_KEY]: state });
}
