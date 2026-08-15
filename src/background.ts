import { CaptureEventBuffer } from './capture/event-buffer.ts';
import { processObservedResponse } from './capture/observer.ts';
import { isGbfPageUrl } from './capture/policy.ts';
import {
  finishCaptureScan,
  getCaptureScan,
  getLatestCaptureScan,
  saveCapturedResponse,
  startCaptureScan,
} from './capture/storage.ts';
import { ingestCapturedCombatRecord } from './combat/storage.ts';
import type {
  CaptureMessage,
  CaptureResourceType,
  CaptureStatusResponse,
  CapturedResponseRecord,
  DebuggerResponseBody,
} from './capture/types.ts';

const DEBUGGER_PROTOCOL_VERSION = '1.3';
const STATE_KEY = 'gbfit:capture-state';
const pendingResponses = new CaptureEventBuffer();
let eventQueue: Promise<void> = Promise.resolve();

type RuntimeState = {
  active: boolean;
  tabId?: number;
  scanId?: string;
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
  if (source.tabId === undefined) return;
  eventQueue = eventQueue
    .then(() => handleDebuggerEvent(source.tabId as number, method, params))
    .catch(() => {});
});

chrome.debugger.onDetach.addListener((source, reason) => {
  if (source.tabId === undefined) return;
  void handleUnexpectedDetach(source.tabId, reason);
});

async function handleMessage(message: CaptureMessage): Promise<CaptureStatusResponse> {
  switch (message.type) {
    case 'gbfit:start-observation':
      return await startObservation();
    case 'gbfit:stop-observation':
      return await stopObservation();
    case 'gbfit:get-status':
      return await getStatus();
  }
}

async function startObservation(): Promise<CaptureStatusResponse> {
  const existing = await getRuntimeState();
  if (existing.active) return await getStatus();

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined || !isGbfPageUrl(tab.url)) {
    throw new Error('Open game.granbluefantasy.jp in the active tab before starting observation.');
  }

  const target = { tabId: tab.id };
  const scanId = crypto.randomUUID();
  let scanStarted = false;
  try {
    pendingResponses.clear();
    await chrome.debugger.attach(target, DEBUGGER_PROTOCOL_VERSION);
    await startCaptureScan(scanId);
    scanStarted = true;
    await setRuntimeState({ active: true, tabId: tab.id, scanId });
    await chrome.debugger.sendCommand(target, 'Network.enable');
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

async function stopObservation(): Promise<CaptureStatusResponse> {
  const state = await getRuntimeState();
  if (!state.active || state.tabId === undefined || !state.scanId) return await getStatus();

  await setRuntimeState({ active: false, scanId: state.scanId });
  pendingResponses.clear();
  await finishCaptureScan(state.scanId);
  try {
    await chrome.debugger.detach({ tabId: state.tabId });
  } catch {
    // Already detached or tab closed; the scan has still been finalized locally.
  }
  return await getStatus();
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

  const state = await getRuntimeState();
  if (!state.active || state.tabId !== tabId || !state.scanId) return;

  if (method === 'Network.responseReceived') {
    const event = params as NetworkResponseReceived | undefined;
    const resourceType = normalizeResourceType(event?.type);
    const url = event?.response?.url;
    const requestId = event?.requestId;
    if (!url || !requestId) return;

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
  if (!meta) return;

  try {
    await processObservedResponse(
      meta,
      state.scanId,
      {
        getResponseBody: async (id): Promise<DebuggerResponseBody> =>
          (await chrome.debugger.sendCommand(
            { tabId },
            'Network.getResponseBody',
            { requestId: id },
          )) as DebuggerResponseBody,
      },
      saveObservedResponse,
    );
  } catch {
    // Body can still be unavailable for redirects/cache races; skip only that candidate.
  }
}

async function saveObservedResponse(record: CapturedResponseRecord): Promise<void> {
  const combat = await ingestCapturedCombatRecord(record);
  if (!combat) await saveCapturedResponse(record);
}

async function handleUnexpectedDetach(tabId: number, reason: string): Promise<void> {
  const state = await getRuntimeState();
  if (!state.active || state.tabId !== tabId || !state.scanId) return;

  pendingResponses.clear();
  await finishCaptureScan(state.scanId);
  await setRuntimeState({
    active: false,
    scanId: state.scanId,
    error: `Observation stopped: ${reason}`,
  });
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
      ? 'Observing GBF responses generated by your normal browsing.'
      : scan
        ? 'Observation is off. Last scan remains local.'
        : 'Observation is off. No scan captured yet.',
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
