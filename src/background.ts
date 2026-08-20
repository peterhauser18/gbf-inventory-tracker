import { ingestAccountRecord } from './account/ingest.ts';
import { loadAccountDatabase, resetAccountDatabase, saveAccountDatabase } from './account/storage.ts';
import {
  clearObservedActorImageCache,
  parseObservedActorImageResponse,
  storeObservedActorImageBody,
} from './actor-image-cache.ts';
import { parseObservedDeckSelectionRequest, type ObservedDeckSelection } from './capture/deck-selection.ts';
import { CaptureEventBuffer } from './capture/event-buffer.ts';
import {
  processObservedResponse,
  readResponseBodyWithRetry,
  ResponseBodyUnavailableError,
} from './capture/observer.ts';
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
import { rememberObservedBattleDeckSelection } from './combat/loadout.ts';
import {
  clearCombatParseContext,
  clearCombatStorage,
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
import {
  clearObservedEnemyIconCache,
  parseObservedEnemyIconResponse,
  storeObservedEnemyIconBody,
} from './enemy-icon-cache.ts';
import { cleanupLocalData, type LocalCleanupMode } from './storage/cleanup.ts';
import {
  clearObservedTreasureIconCache,
  parseObservedTreasureIconResponse,
  storeObservedTreasureIconBody,
} from './treasure-icon-cache.ts';

const DEBUGGER_PROTOCOL_VERSION = '1.3';
const STATE_KEY = 'gbfit:capture-state';
const NETWORK_MAX_TOTAL_BUFFER_SIZE = 32 * 1024 * 1024;
const NETWORK_MAX_RESOURCE_BUFFER_SIZE = 8 * 1024 * 1024;
const CAPTURE_NETWORK_METHODS = new Set([
  'Network.requestWillBeSent',
  'Network.responseReceived',
  'Network.loadingFinished',
  'Network.loadingFailed',
]);
const pendingResponses = new Map<number, CaptureEventBuffer>();
const pendingTreasureIcons = new Map<string, { itemId: string }>();
const pendingEnemyIcons = new Map<string, { enemyId: string; mimeType: string }>();
const pendingActorImages = new Map<string, { assetId: string; mimeType: string }>();
const pendingDeckSelections = new Map<number, ObservedDeckSelection & { scanId: string }>();
let eventQueue: Promise<void> = Promise.resolve();
let accountQueue: Promise<void> = Promise.resolve();
let targetQueue: Promise<void> = Promise.resolve();

type RuntimeState = {
  active: boolean;
  tabId?: number;
  tabIds?: number[];
  scanId?: string;
  combatInstances?: Record<string, string>;
  // Legacy single-tab lock fields are migrated into combatInstances.
  combatTabId?: number;
  combatInstanceId?: string;
  error?: string;
};

type NetworkRequestWillBeSent = {
  request?: {
    url?: string;
    method?: string;
    postData?: string;
  };
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

chrome.tabs.onAttached.addListener((tabId) => {
  void recoverMovedCombatTarget(tabId);
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
    .then(async () => {
      await resetAccountDatabase();
      await clearObservedTreasureIconCache();
    });
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
  if (mode === 'all-except-account') {
    await clearObservedTreasureIconCache();
    await clearObservedEnemyIconCache();
    await clearObservedActorImageCache();
  }
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
    clearPendingObservationData();
    await clearCombatParseContext();
    await chrome.debugger.attach(target, DEBUGGER_PROTOCOL_VERSION);
    await startCaptureScan(scanId);
    scanStarted = true;
    await setRuntimeState({
      active: true,
      tabId: target.tabId,
      tabIds: [target.tabId],
      scanId,
      combatInstances: {},
    });
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

  const tabIds = observationTabIds(state);
  await setRuntimeState({ active: false, scanId: state.scanId });
  clearPendingObservationData();
  await finishCaptureScan(state.scanId);
  await clearCombatParseContext();
  for (const tabId of tabIds) {
    try {
      await chrome.debugger.detach({ tabId });
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
  if (!state.scanId || observationIncludesTab(state, candidateTabId)) return;
  if (!await isVerifiedGbfTab(candidateTabId)) return;

  let candidateAttached = false;
  try {
    await chrome.debugger.attach({ tabId: candidateTabId }, DEBUGGER_PROTOCOL_VERSION);
    candidateAttached = true;
    await enableNetworkObservation(candidateTabId);

    const current = await getRuntimeState();
    if (!current.active || current.scanId !== state.scanId) {
      await chrome.debugger.detach({ tabId: candidateTabId });
      return;
    }
    const tabIds = [...new Set([...observationTabIds(current), candidateTabId])];
    const next = { ...current, tabId: candidateTabId, tabIds };
    delete next.error;
    await setRuntimeState(next);
  } catch (error) {
    if (candidateAttached) {
      try {
        await chrome.debugger.detach({ tabId: candidateTabId });
      } catch {
        // The existing observation targets remain active even if this candidate failed.
      }
    }
    const current = await getRuntimeState();
    if (!current.active || current.scanId !== state.scanId) return;
    await setRuntimeState({
      ...current,
      error: `Could not add observation target: ${error instanceof Error ? error.message : String(error)}`,
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
    // A closed tab will also be absent from debugger targets below.
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

async function recoverMovedCombatTarget(tabId: number): Promise<void> {
  const state = await getRuntimeState();
  if (
    !state.active ||
    !state.scanId ||
    observationIncludesTab(state, tabId) ||
    !combatInstanceForTab(state, tabId)
  ) return;
  await queueObservationRetarget(tabId);
}

async function releaseUnavailableTarget(tabId: number, reason: string): Promise<void> {
  const state = await getRuntimeState();
  if (!state.active || !state.scanId) return;
  const combatInstances = getCombatInstances(state);
  const tabKey = String(tabId);
  const hadCombat = combatInstances[tabKey] !== undefined;
  const wasObserved = observationIncludesTab(state, tabId);
  delete combatInstances[tabKey];
  if (!wasObserved && !hadCombat) return;

  clearPendingObservationData(tabId);
  const tabIds = observationTabIds(state).filter((observedTabId) => observedTabId !== tabId);
  const next: RuntimeState = {
    ...state,
    active: true,
    scanId: state.scanId,
    tabIds,
    combatInstances,
    error: `Observation target released: ${reason}.`,
  };
  if (state.tabId === tabId) {
    if (tabIds.length) next.tabId = tabIds[tabIds.length - 1];
    else delete next.tabId;
  }
  await setRuntimeState(next);

  if (!tabIds.length) void retargetToFocusedGbfTab();
}

async function handleDebuggerEvent(
  tabId: number,
  method: string,
  params: object | undefined,
): Promise<void> {
  if (method === 'Network.requestWillBeSent') {
    const event = params as NetworkRequestWillBeSent | undefined;
    const request = event?.request;
    if (!request?.url) return;
    const selection = parseObservedDeckSelectionRequest(request.url, request.method, request.postData);
    if (!selection) return;
    const state = await getRuntimeState();
    if (!state.active || !observationIncludesTab(state, tabId) || !state.scanId) return;
    pendingDeckSelections.set(tabId, { ...selection, scanId: state.scanId });
    return;
  }

  if (method === 'Network.loadingFailed') {
    const requestId = (params as { requestId?: string } | undefined)?.requestId;
    if (requestId) {
      pendingResponseBuffer(tabId).forget(requestId);
      const key = scopedRequestId(tabId, requestId);
      pendingTreasureIcons.delete(key);
      pendingEnemyIcons.delete(key);
      pendingActorImages.delete(key);
    }
    return;
  }

  if (method === 'Network.responseReceived') {
    const event = params as NetworkResponseReceived | undefined;
    const url = event?.response?.url;
    const requestId = event?.requestId;
    if (!url || !requestId) return;

    const treasureIcon = parseObservedTreasureIconResponse(
      url,
      event?.type,
      event?.response?.mimeType,
      event?.response?.status,
    );
    if (treasureIcon) {
      const state = await getRuntimeState();
      if (!state.active || !observationIncludesTab(state, tabId) || !state.scanId) return;
      pendingTreasureIcons.set(scopedRequestId(tabId, requestId), { itemId: treasureIcon.itemId });
      return;
    }

    const enemyIcon = parseObservedEnemyIconResponse(
      url,
      event?.type,
      event?.response?.mimeType,
      event?.response?.status,
    );
    if (enemyIcon) {
      const state = await getRuntimeState();
      if (!state.active || !observationIncludesTab(state, tabId) || !state.scanId) return;
      pendingEnemyIcons.set(scopedRequestId(tabId, requestId), { enemyId: enemyIcon.enemyId, mimeType: enemyIcon.mimeType });
      return;
    }

    const actorImage = parseObservedActorImageResponse(
      url,
      event?.type,
      event?.response?.mimeType,
      event?.response?.status,
    );
    if (actorImage) {
      const state = await getRuntimeState();
      if (!state.active || !observationIncludesTab(state, tabId) || !state.scanId) return;
      pendingActorImages.set(scopedRequestId(tabId, requestId), { assetId: actorImage.assetId, mimeType: actorImage.mimeType });
      return;
    }

    const resourceType = normalizeResourceType(event?.type);
    if (!shouldReadObservedResponse(url, resourceType)) return;

    const state = await getRuntimeState();
    if (!state.active || !observationIncludesTab(state, tabId) || !state.scanId) return;

    pendingResponseBuffer(tabId).remember({
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
  const requestKey = scopedRequestId(tabId, requestId);

  const pendingTreasureIcon = pendingTreasureIcons.get(requestKey);
  pendingTreasureIcons.delete(requestKey);
  if (pendingTreasureIcon) {
    const state = await getRuntimeState();
    if (!state.active || !observationIncludesTab(state, tabId) || !state.scanId) return;
    void captureObservedTreasureIcon(tabId, requestId, pendingTreasureIcon.itemId);
    return;
  }

  const pendingEnemyIcon = pendingEnemyIcons.get(requestKey);
  pendingEnemyIcons.delete(requestKey);
  if (pendingEnemyIcon) {
    const state = await getRuntimeState();
    if (!state.active || !observationIncludesTab(state, tabId) || !state.scanId) return;
    void captureObservedEnemyIcon(tabId, requestId, pendingEnemyIcon.enemyId, pendingEnemyIcon.mimeType);
    return;
  }

  const pendingActorImage = pendingActorImages.get(requestKey);
  pendingActorImages.delete(requestKey);
  if (pendingActorImage) {
    const state = await getRuntimeState();
    if (!state.active || !observationIncludesTab(state, tabId) || !state.scanId) return;
    void captureObservedActorImage(tabId, requestId, pendingActorImage.assetId, pendingActorImage.mimeType);
    return;
  }

  const meta = pendingResponseBuffer(tabId).take(requestId);
  if (!meta || !shouldReadObservedResponse(meta.url, meta.resourceType)) return;

  const state = await getRuntimeState();
  if (!state.active || !observationIncludesTab(state, tabId) || !state.scanId) return;
  void captureObservedResponse(tabId, state.scanId, meta);
}

async function captureObservedTreasureIcon(tabId: number, requestId: string, itemId: string): Promise<void> {
  try {
    const body = await readResponseBodyWithRetry({
      getResponseBody: async (id): Promise<DebuggerResponseBody> =>
        (await chrome.debugger.sendCommand(
          { tabId },
          'Network.getResponseBody',
          { requestId: id },
        )) as DebuggerResponseBody,
    }, requestId);
    await storeObservedTreasureIconBody(itemId, body);
  } catch {
    // Observed Treasure icons are an optional local visual cache; account capture must continue unchanged.
  }
}

async function captureObservedEnemyIcon(
  tabId: number,
  requestId: string,
  enemyId: string,
  mimeType: string,
): Promise<void> {
  try {
    const body = await readResponseBodyWithRetry({
      getResponseBody: async (id): Promise<DebuggerResponseBody> =>
        (await chrome.debugger.sendCommand(
          { tabId },
          'Network.getResponseBody',
          { requestId: id },
        )) as DebuggerResponseBody,
    }, requestId);
    await storeObservedEnemyIconBody(enemyId, mimeType, body);
  } catch {
    // Enemy images are optional local visuals copied only from responses already loaded by the game.
  }
}

async function captureObservedActorImage(
  tabId: number,
  requestId: string,
  assetId: string,
  mimeType: string,
): Promise<void> {
  try {
    const body = await readResponseBodyWithRetry({
      getResponseBody: async (id): Promise<DebuggerResponseBody> =>
        (await chrome.debugger.sendCommand(
          { tabId },
          'Network.getResponseBody',
          { requestId: id },
        )) as DebuggerResponseBody,
    }, requestId);
    await storeObservedActorImageBody(assetId, mimeType, body);
  } catch {
    // Actor images are optional local visuals copied only from responses already loaded by the game.
  }
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
    await rememberPendingDeckSelectionForBattle(tabId, record);
    const state = await getRuntimeState();
    const parse = await ingestCapturedCombatRecord(record, combatInstanceForTab(state, tabId) ?? null);
    if (parse?.instanceId) {
      await updateCombatLock(tabId, parse.instanceId, parse.result);
    }
    return;
  }
  if (route !== 'account') return;

  await queueAccountIngest(record);
  await saveCapturedResponse(record);
}

async function rememberPendingDeckSelectionForBattle(
  tabId: number,
  record: CapturedResponseRecord,
): Promise<void> {
  const instanceId = battleStartInstanceId(record);
  if (!instanceId) return;
  const selection = pendingDeckSelections.get(tabId);
  if (!selection) return;
  if (selection.scanId !== record.scanId) {
    pendingDeckSelections.delete(tabId);
    return;
  }
  if (selection.raidId && selection.raidId !== instanceId) return;
  await rememberObservedBattleDeckSelection(record.scanId, instanceId, selection.deckId);
  pendingDeckSelections.delete(tabId);
}

function battleStartInstanceId(record: CapturedResponseRecord): string | undefined {
  try {
    const path = new URL(record.meta.url).pathname;
    if (path !== '/rest/multiraid/start.json' && path !== '/rest/raid/start.json') return undefined;
  } catch {
    return undefined;
  }
  const body = record.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return undefined;
  const value = (body as Record<string, unknown>).raid_id;
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const normalized = String(value).trim();
  return /^\d+$/.test(normalized) && normalized !== '0' && normalized.length <= 120
    ? normalized
    : undefined;
}

async function updateCombatLock(tabId: number, instanceId: string, result: RaidResult): Promise<void> {
  const current = await getRuntimeState();
  if (!current.active || !current.scanId) return;
  const combatInstances = getCombatInstances(current);
  const key = String(tabId);

  if (result === 'active') {
    if (combatInstances[key] === instanceId) return;
    combatInstances[key] = instanceId;
    await setRuntimeState({ ...current, combatInstances });
    return;
  }

  if (!isTerminalResult(result) || combatInstances[key] !== instanceId) return;
  delete combatInstances[key];
  await setRuntimeState({ ...current, combatInstances });
}

async function recordObservationReadWarning(
  tabId: number,
  scanId: string,
  url: string,
  error: unknown,
): Promise<void> {
  const current = await getRuntimeState();
  if (!current.active || !observationIncludesTab(current, tabId) || current.scanId !== scanId) return;

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
    !observationIncludesTab(current, tabId) ||
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
  if (!state.active || !observationIncludesTab(state, tabId) || !state.scanId) return;

  clearPendingObservationData(tabId);
  if (reason === 'canceled_by_user') {
    const remainingTabIds = observationTabIds(state).filter((observedTabId) => observedTabId !== tabId);
    await clearCombatParseContext();
    await finishCaptureScan(state.scanId);
    await setRuntimeState({
      active: false,
      scanId: state.scanId,
      error: `Observation stopped: ${reason}`,
    });
    for (const remainingTabId of remainingTabIds) {
      try {
        await chrome.debugger.detach({ tabId: remainingTabId });
      } catch {
        // The observation is already stopped even if a target disappeared concurrently.
      }
    }
    return;
  }

  const tabIds = observationTabIds(state).filter((observedTabId) => observedTabId !== tabId);
  const next: RuntimeState = {
    ...state,
    tabIds,
    error: `Observation target detached: ${reason}.`,
  };
  if (state.tabId === tabId) {
    if (tabIds.length) next.tabId = tabIds[tabIds.length - 1];
    else delete next.tabId;
  }
  await setRuntimeState(next);

  if (combatInstanceForTab(state, tabId)) {
    void queueObservationRetarget(tabId);
    return;
  }
  void retargetToFocusedGbfTab();
}

function clearPendingObservationData(tabId?: number): void {
  if (tabId === undefined) {
    for (const buffer of pendingResponses.values()) buffer.clear();
    pendingResponses.clear();
    pendingTreasureIcons.clear();
    pendingEnemyIcons.clear();
    pendingActorImages.clear();
    pendingDeckSelections.clear();
    return;
  }

  pendingResponses.get(tabId)?.clear();
  pendingResponses.delete(tabId);
  const prefix = `${tabId}:`;
  for (const map of [pendingTreasureIcons, pendingEnemyIcons, pendingActorImages]) {
    for (const key of map.keys()) {
      if (key.startsWith(prefix)) map.delete(key);
    }
  }
  pendingDeckSelections.delete(tabId);
}

function pendingResponseBuffer(tabId: number): CaptureEventBuffer {
  let buffer = pendingResponses.get(tabId);
  if (!buffer) {
    buffer = new CaptureEventBuffer();
    pendingResponses.set(tabId, buffer);
  }
  return buffer;
}

function scopedRequestId(tabId: number, requestId: string): string {
  return `${tabId}:${requestId}`;
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
  const observedTabs = observationTabIds(state).length;
  return {
    version: 1,
    captureReady: true,
    active: state.active,
    message: state.active
      ? observedTabs > 0
        ? `Debugger observation is active on ${observedTabs} verified GBF tab${observedTabs === 1 ? '' : 's'}. Only allowlisted GBF responses and selected deck IDs from game-issued quest/join requests are read.`
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
  const state = (stored[STATE_KEY] as RuntimeState | undefined) ?? { active: false };
  return normalizeRuntimeState(state);
}

async function setRuntimeState(state: RuntimeState): Promise<void> {
  await chrome.storage.session.set({ [STATE_KEY]: normalizeRuntimeState(state) });
}

function normalizeRuntimeState(state: RuntimeState): RuntimeState {
  const tabIds = observationTabIds(state);
  const normalized: RuntimeState = {
    ...state,
    tabIds,
    combatInstances: getCombatInstances(state),
  };
  if (!tabIds.length) {
    delete normalized.tabIds;
    delete normalized.tabId;
  } else if (normalized.tabId === undefined || !tabIds.includes(normalized.tabId)) {
    normalized.tabId = tabIds[tabIds.length - 1];
  }
  delete normalized.combatTabId;
  delete normalized.combatInstanceId;
  return normalized;
}

function observationTabIds(state: RuntimeState): number[] {
  const values = [
    ...(state.tabIds ?? []),
    ...(state.tabId === undefined ? [] : [state.tabId]),
  ];
  return [...new Set(values.filter((value) => Number.isInteger(value) && value >= 0))];
}

function observationIncludesTab(state: RuntimeState, tabId: number): boolean {
  return observationTabIds(state).includes(tabId);
}

function getCombatInstances(state: RuntimeState): Record<string, string> {
  const instances = { ...(state.combatInstances ?? {}) };
  if (state.combatTabId !== undefined && state.combatInstanceId) {
    instances[String(state.combatTabId)] ??= state.combatInstanceId;
  }
  return instances;
}

function combatInstanceForTab(state: RuntimeState, tabId: number): string | undefined {
  return getCombatInstances(state)[String(tabId)];
}
