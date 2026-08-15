export type CaptureResourceType = 'xhr' | 'fetch' | 'document' | 'other';

export interface CapturedResponseMeta {
  requestId: string;
  url: string;
  method?: string;
  status?: number;
  mimeType?: string;
  resourceType: CaptureResourceType;
  capturedAt: number;
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
