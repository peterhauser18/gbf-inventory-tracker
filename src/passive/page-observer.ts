export type PassiveResourceType = 'xhr' | 'fetch';

export interface PassiveAccountResponse {
  url: string;
  status?: number;
  mimeType?: string;
  resourceType: PassiveResourceType;
  body: string;
}

export type PassiveResponseEmitter = (response: PassiveAccountResponse) => void;

const VERIFIED_PATHS = [
  /^\/npc\/list\/\d+$/,
  /^\/weapon\/list\/\d+$/,
  /^\/summon\/list\/\d+$/,
  /^\/rest\/artifact\/list\/\d+$/,
  /^\/weapon\/container_list\/\d+\/[^/]+$/,
];

const VERIFIED_EXACT_PATHS = new Set([
  '/item/article_list_by_filter_mode',
  '/item/recovery_and_evolution_list_by_filter_mode',
  '/item/gacha_ticket_and_others_list_by_filter_mode',
  '/user/status',
]);

export function isVerifiedPassiveAccountUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'game.granbluefantasy.jp') return false;
    return VERIFIED_EXACT_PATHS.has(parsed.pathname) || VERIFIED_PATHS.some((pattern) => pattern.test(parsed.pathname));
  } catch {
    return false;
  }
}

export function wrapFetch(nativeFetch: typeof fetch, emit: PassiveResponseEmitter): typeof fetch {
  return function wrappedFetch(this: unknown, input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const pending = Reflect.apply(nativeFetch, this, init === undefined ? [input] : [input, init]) as Promise<Response>;
    void pending.then((response) => observeFetchResponse(response, emit)).catch(() => {});
    return pending;
  } as typeof fetch;
}

export function installPassivePageObserver(host: Window & typeof globalThis, emit: PassiveResponseEmitter): void {
  host.fetch = wrapFetch(host.fetch, emit);

  const prototype = host.XMLHttpRequest.prototype;
  const nativeSend = prototype.send;
  prototype.send = function passiveObservedSend(body?: Document | XMLHttpRequestBodyInit | null): void {
    this.addEventListener('loadend', () => observeXhrResponse(this, emit), { once: true });
    Reflect.apply(nativeSend, this, arguments as unknown as ArrayLike<unknown>);
  };
}

async function observeFetchResponse(response: Response, emit: PassiveResponseEmitter): Promise<void> {
  if (!isVerifiedPassiveAccountUrl(response.url)) return;
  try {
    const clone = response.clone();
    emit({
      url: sanitizeUrl(response.url),
      status: response.status,
      mimeType: response.headers.get('content-type') ?? undefined,
      resourceType: 'fetch',
      body: await clone.text(),
    });
  } catch {
    // The page keeps its original response even if the observational clone cannot be read.
  }
}

function observeXhrResponse(xhr: XMLHttpRequest, emit: PassiveResponseEmitter): void {
  if (!isVerifiedPassiveAccountUrl(xhr.responseURL)) return;
  try {
    let body: string;
    if (xhr.responseType === '' || xhr.responseType === 'text') body = xhr.responseText;
    else if (xhr.responseType === 'json') body = JSON.stringify(xhr.response);
    else return;

    emit({
      url: sanitizeUrl(xhr.responseURL),
      status: xhr.status,
      mimeType: xhr.getResponseHeader('content-type') ?? undefined,
      resourceType: 'xhr',
      body,
    });
  } catch {
    // Unsupported response bodies are ignored rather than changing page behavior.
  }
}

function sanitizeUrl(url: string): string {
  const parsed = new URL(url);
  return `${parsed.origin}${parsed.pathname}`;
}
