export type CaptureResourceType = 'xhr' | 'fetch' | 'document' | 'other';

export type CaptureCategory =
  | 'characters'
  | 'weapons'
  | 'summons'
  | 'treasures'
  | 'progression'
  | 'roster';

export interface CapturedResponseMeta {
  requestId: string;
  url: string;
  status?: number;
  mimeType?: string;
  resourceType: CaptureResourceType;
  capturedAt: number;
}

export interface CapturedResponseRecord {
  id: string;
  scanId: string;
  meta: CapturedResponseMeta;
  body: unknown;
  categories: CaptureCategory[];
}

export interface CaptureScanSummary {
  id: string;
  startedAt: number;
  stoppedAt?: number;
  responseCount: number;
  categories: Record<CaptureCategory, boolean>;
}

export interface ObservedResponse {
  requestId: string;
  url: string;
  status?: number;
  mimeType?: string;
  resourceType: CaptureResourceType;
}

export interface DebuggerResponseBody {
  body: string;
  base64Encoded?: boolean;
}

export interface ParserContext {
  meta: CapturedResponseMeta;
  body: unknown;
}

export interface CaptureParser<T> {
  id: string;
  matches(meta: CapturedResponseMeta): boolean;
  parse(context: ParserContext): T | null;
}

export type CaptureMessage =
  | { type: 'gbfit:get-status' }
  | { type: 'gbfit:start-observation' }
  | { type: 'gbfit:stop-observation' };

export interface CaptureStatusResponse {
  version: 1;
  captureReady: true;
  active: boolean;
  message: string;
  scan: CaptureScanSummary | null;
  error?: string;
}
