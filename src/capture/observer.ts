import { ingestObservedLoadoutRecord } from '../combat/loadout-observer.ts';
import {
  maybeStoreRawCombatReadFailure,
  maybeStoreRawCombatResponse,
} from '../combat/raw-capture.ts';
import { buildCapturedResponse } from './policy.ts';
import { classifyObservedResponseUrl, shouldReadObservedResponse } from './route.ts';
import type {
  CapturedResponseRecord,
  DebuggerResponseBody,
  ObservedResponse,
} from './types.ts';

export interface ResponseBodyReader {
  getResponseBody(requestId: string): Promise<DebuggerResponseBody>;
}

export type CaptureRecordSink = (record: CapturedResponseRecord) => Promise<void>;

const RESPONSE_BODY_RETRY_DELAYS_MS = [25, 100] as const;

export class ResponseBodyUnavailableError extends Error {
  readonly requestId: string;

  constructor(requestId: string) {
    super(`Debugger response body unavailable for request ${requestId}`);
    this.name = 'ResponseBodyUnavailableError';
    this.requestId = requestId;
  }
}

export async function processObservedResponse(
  meta: ObservedResponse,
  scanId: string,
  reader: ResponseBodyReader,
  save: CaptureRecordSink,
  capturedAt = Date.now(),
): Promise<CapturedResponseRecord | null> {
  if (!shouldReadObservedResponse(meta.url, meta.resourceType)) return null;

  let responseBody: DebuggerResponseBody;
  try {
    responseBody = await readResponseBodyWithRetry(reader, meta.requestId);
  } catch (error) {
    if (error instanceof ResponseBodyUnavailableError) {
      try {
        await maybeStoreRawCombatReadFailure(
          meta,
          capturedAt,
          classifyObservedResponseUrl(meta.url) === 'combat',
        );
      } catch {
        // Raw capture diagnostics must never interrupt normal observation failure handling.
      }
    }
    throw error;
  }

  const rawBody = responseBody.base64Encoded
    ? decodeBase64Utf8(responseBody.body)
    : responseBody.body;
  const record = buildCapturedResponse(meta, rawBody, scanId, capturedAt);
  if (!record) return null;

  try {
    await maybeStoreRawCombatResponse(
      meta,
      rawBody,
      capturedAt,
      classifyObservedResponseUrl(meta.url) === 'combat',
    );
  } catch {
    // Raw capture is optional diagnostics and must never interrupt normal parsing.
  }
  await save(record);
  try {
    await ingestObservedLoadoutRecord(record);
  } catch {
    // Loadout enrichment is optional and must never interrupt the core passive capture path.
  }
  return record;
}

export async function readResponseBodyWithRetry(
  reader: ResponseBodyReader,
  requestId: string,
  retryDelaysMs: readonly number[] = RESPONSE_BODY_RETRY_DELAYS_MS,
  sleep: (delayMs: number) => Promise<void> = delay,
): Promise<DebuggerResponseBody> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await reader.getResponseBody(requestId);
    } catch {
      const retryDelay = retryDelaysMs[attempt];
      if (retryDelay === undefined) throw new ResponseBodyUnavailableError(requestId);
      await sleep(retryDelay);
    }
  }
}

function delay(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function decodeBase64Utf8(encoded: string): string {
  const binary = atob(encoded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
