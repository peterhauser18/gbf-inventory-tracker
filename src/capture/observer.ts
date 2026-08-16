import { buildCapturedResponse } from './policy.ts';
import { shouldReadObservedResponse } from './route.ts';
import type {
  CapturedResponseRecord,
  DebuggerResponseBody,
  ObservedResponse,
} from './types.ts';

export interface ResponseBodyReader {
  getResponseBody(requestId: string): Promise<DebuggerResponseBody>;
}

export type CaptureRecordSink = (record: CapturedResponseRecord) => Promise<void>;

export async function processObservedResponse(
  meta: ObservedResponse,
  scanId: string,
  reader: ResponseBodyReader,
  save: CaptureRecordSink,
  capturedAt = Date.now(),
): Promise<CapturedResponseRecord | null> {
  if (!shouldReadObservedResponse(meta.url, meta.resourceType)) return null;

  const responseBody = await reader.getResponseBody(meta.requestId);
  const rawBody = responseBody.base64Encoded
    ? decodeBase64Utf8(responseBody.body)
    : responseBody.body;
  const record = buildCapturedResponse(meta, rawBody, scanId, capturedAt);
  if (!record) return null;

  await save(record);
  return record;
}

function decodeBase64Utf8(encoded: string): string {
  const binary = atob(encoded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
