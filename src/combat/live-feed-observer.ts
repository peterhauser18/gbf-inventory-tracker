import { readResponseBodyWithRetry } from '../capture/observer.ts';
import { isGbfPageUrl } from '../capture/policy.ts';
import type { DebuggerResponseBody } from '../capture/types.ts';
import {
  clearLiveBattleFeedParticipantSnapshot,
  liveBattleFeedInstanceId,
  liveBattleFeedRecord,
  liveParticipantIdentities,
  liveParticipantSnapshotRecord,
  rememberLiveParticipantIdentities,
  type LiveBattleFeedSocket,
  type LiveParticipantIdentity,
} from './live-feed.ts';
import { getActiveCombatRaids, ingestCapturedCombatRecord } from './storage.ts';

type Obj = Record<string, unknown>;

type PendingStart = {
  tabId: number;
  capturedAt: number;
};

type PersistedIdentities = Record<string, Record<string, LiveParticipantIdentity>>;

const LIVE_IDENTITIES_KEY = 'gbfit:combat-live-feed-identities';
const sockets = new Map<string, LiveBattleFeedSocket>();
const pendingStarts = new Map<string, PendingStart>();
const restoredIdentityRaids = new Set<string>();

if (typeof chrome !== 'undefined' && chrome.debugger?.onEvent) {
  chrome.debugger.onEvent.addListener((source, method, params) => {
    void handleLiveBattleFeedDebuggerEvent(source.tabId, method, params).catch(() => {});
  });
  chrome.debugger.onDetach.addListener((source) => {
    if (source.tabId !== undefined) clearForTab(source.tabId);
    void clearPersistedIdentities();
  });
  chrome.tabs.onRemoved.addListener((tabId) => {
    clearForTab(tabId);
    void clearPersistedIdentities();
  });
}

export async function handleLiveBattleFeedDebuggerEvent(
  tabId: number | undefined,
  method: string,
  params: object | undefined,
  observedAt = Date.now(),
): Promise<void> {
  if (tabId === undefined) return;

  if (method === 'Network.responseReceived') {
    const event = params as { requestId?: string; response?: { url?: string }; type?: string } | undefined;
    const requestId = event?.requestId;
    const url = event?.response?.url;
    if (!requestId || !url || !isMultiraidStart(url) || !isResponseResource(event?.type)) return;
    if (!await isObservedGbfTab(tabId)) return;
    pendingStarts.set(requestId, { tabId, capturedAt: observedAt });
    return;
  }

  if (method === 'Network.loadingFailed') {
    const requestId = (params as { requestId?: string } | undefined)?.requestId;
    if (requestId) pendingStarts.delete(requestId);
    return;
  }

  if (method === 'Network.loadingFinished') {
    const requestId = (params as { requestId?: string } | undefined)?.requestId;
    if (!requestId) return;
    const pending = pendingStarts.get(requestId);
    pendingStarts.delete(requestId);
    if (!pending || pending.tabId !== tabId) return;
    await captureStartParticipants(tabId, requestId, pending.capturedAt);
    return;
  }

  if (method === 'Network.webSocketCreated') {
    const event = params as { requestId?: string; url?: string } | undefined;
    const requestId = event?.requestId;
    const instanceId = event?.url ? liveBattleFeedInstanceId(event.url) : undefined;
    if (!requestId || !instanceId || !await isObservedGbfTab(tabId)) return;
    sockets.set(requestId, { requestId, instanceId, tabId });
    return;
  }

  const requestId = (params as { requestId?: string } | undefined)?.requestId;
  if (!requestId) return;

  if (method === 'Network.webSocketClosed') {
    sockets.delete(requestId);
    return;
  }

  if (method !== 'Network.webSocketFrameReceived') return;
  const socket = sockets.get(requestId);
  if (!socket || socket.tabId !== tabId) return;

  const response = obj((params as { response?: unknown } | undefined)?.response)
    ? (params as { response: Obj }).response
    : undefined;
  const opcode = num(response?.opcode);
  if (opcode !== undefined && opcode !== 1) return;
  const payloadData = typeof response?.payloadData === 'string' ? response.payloadData : undefined;
  if (!payloadData) return;

  await restoreParticipantIdentities(socket.instanceId);
  const parsed = liveBattleFeedRecord(socket.instanceId, requestId, payloadData, observedAt);
  if (!parsed) return;
  await ingestCapturedCombatRecord(parsed.record, socket.instanceId);
  if (parsed.identityChanged) await persistParticipantIdentities(socket.instanceId);
}

async function captureStartParticipants(tabId: number, requestId: string, observedAt: number): Promise<void> {
  // Let the primary capture path ingest start.json first. This is a second local
  // CDP body read only; it does not issue or replay any GBF request.
  await delay(125);
  const responseBody = await readResponseBodyWithRetry({
    getResponseBody: async (id) => await chrome.debugger.sendCommand(
      { tabId },
      'Network.getResponseBody',
      { requestId: id },
    ) as DebuggerResponseBody,
  }, requestId);
  const rawBody = responseBody.base64Encoded ? decodeBase64Utf8(responseBody.body) : responseBody.body;
  const snapshot = liveParticipantSnapshotRecord(rawBody, requestId, observedAt);
  if (!snapshot) return;

  await persistParticipantIdentities(snapshot.instanceId);
  if (!await waitForActiveInstance(snapshot.instanceId)) return;
  await ingestCapturedCombatRecord(snapshot.record, snapshot.instanceId);
}

async function waitForActiveInstance(instanceId: string): Promise<boolean> {
  for (const delayMs of [0, 25, 100, 250]) {
    if (delayMs > 0) await delay(delayMs);
    const active = await getActiveCombatRaids();
    if (active.some((entry) => entry.parse.instanceId === instanceId || entry.context?.instanceId === instanceId)) {
      return true;
    }
  }
  return false;
}

async function restoreParticipantIdentities(instanceId: string): Promise<void> {
  if (restoredIdentityRaids.has(instanceId) || Object.keys(liveParticipantIdentities(instanceId)).length > 0) {
    restoredIdentityRaids.add(instanceId);
    return;
  }
  if (typeof chrome === 'undefined' || !chrome.storage?.session) return;
  const stored = (await chrome.storage.session.get(LIVE_IDENTITIES_KEY))[LIVE_IDENTITIES_KEY] as PersistedIdentities | undefined;
  const participants = stored?.[instanceId];
  if (participants) rememberLiveParticipantIdentities(instanceId, participants);
  restoredIdentityRaids.add(instanceId);
}

async function persistParticipantIdentities(instanceId: string): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage?.session) return;
  const participants = liveParticipantIdentities(instanceId);
  if (!Object.keys(participants).length) return;
  const stored = (await chrome.storage.session.get(LIVE_IDENTITIES_KEY))[LIVE_IDENTITIES_KEY] as PersistedIdentities | undefined;
  const next: PersistedIdentities = { ...(stored ?? {}), [instanceId]: participants };
  const keys = Object.keys(next);
  for (const key of keys.slice(0, Math.max(0, keys.length - 8))) delete next[key];
  await chrome.storage.session.set({ [LIVE_IDENTITIES_KEY]: next });
  restoredIdentityRaids.add(instanceId);
}

async function clearPersistedIdentities(): Promise<void> {
  sockets.clear();
  pendingStarts.clear();
  restoredIdentityRaids.clear();
  clearLiveBattleFeedParticipantSnapshot();
  if (typeof chrome !== 'undefined' && chrome.storage?.session) {
    await chrome.storage.session.remove(LIVE_IDENTITIES_KEY);
  }
}

function clearForTab(tabId: number): void {
  for (const [requestId, socket] of sockets) {
    if (socket.tabId === tabId) sockets.delete(requestId);
  }
  for (const [requestId, pending] of pendingStarts) {
    if (pending.tabId === tabId) pendingStarts.delete(requestId);
  }
}

async function isObservedGbfTab(tabId: number): Promise<boolean> {
  try {
    const tab = await chrome.tabs.get(tabId);
    return isGbfPageUrl(tab.url);
  } catch {
    return false;
  }
}

function isMultiraidStart(url: string): boolean {
  try {
    const path = new URL(url).pathname;
    return path === '/rest/multiraid/start.json';
  } catch {
    return false;
  }
}

function isResponseResource(value: string | undefined): boolean {
  const normalized = value?.toLowerCase();
  return normalized === 'xhr' || normalized === 'fetch';
}

function decodeBase64Utf8(encoded: string): string {
  const binary = atob(encoded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function delay(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function obj(value: unknown): value is Obj {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function num(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}
