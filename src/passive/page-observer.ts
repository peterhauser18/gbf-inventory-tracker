export type PassiveResourceType = 'xhr' | 'fetch';

export interface PassiveAccountResponse {
  url: string;
  status?: number;
  mimeType?: string;
  resourceType: PassiveResourceType;
  body: string;
}

export type PassiveResponseEmitter = (response: PassiveAccountResponse) => void;

const VERIFIED_ACCOUNT_PATHS = [
  /^\/npc\/list\/\d+$/,
  /^\/weapon\/list\/\d+$/,
  /^\/summon\/list\/\d+$/,
  /^\/rest\/artifact\/list\/\d+$/,
  /^\/weapon\/container_list\/\d+\/[^/]+$/,
];

const VERIFIED_ACCOUNT_EXACT_PATHS = new Set([
  '/item/article_list_by_filter_mode',
  '/item/recovery_and_evolution_list_by_filter_mode',
  '/item/gacha_ticket_and_others_list_by_filter_mode',
  '/user/status',
]);

const VERIFIED_COMBAT_EXACT_PATHS = new Set([
  '/rest/multiraid/start.json',
  '/rest/multiraid/normal_attack_result.json',
  '/rest/multiraid/ability_result.json',
  '/rest/multiraid/summon_result.json',
  '/rest/multiraid/temporary_item_result.json',
  '/rest/multiraid/multi_member_info',
]);

const VERIFIED_COMBAT_PATHS = [
  /^\/resultmulti\/content\/index\/[^/]+\/?$/,
];

export function isVerifiedPassiveAccountUrl(url: string): boolean {
  const path = verifiedGbfPath(url);
  return path !== null && isVerifiedAccountPath(path);
}

export function isVerifiedPassiveCombatUrl(url: string): boolean {
  const path = verifiedGbfPath(url);
  return path !== null && isVerifiedCombatPath(path);
}

export function isVerifiedPassiveResponseUrl(url: string): boolean {
  const path = verifiedGbfPath(url);
  return path !== null && (isVerifiedAccountPath(path) || isVerifiedCombatPath(path));
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
  if (!isVerifiedPassiveResponseUrl(response.url)) return;
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
  if (!isVerifiedPassiveResponseUrl(xhr.responseURL)) return;
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

function verifiedGbfPath(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'game.granbluefantasy.jp') return null;
    return parsed.pathname;
  } catch {
    return null;
  }
}

function isVerifiedAccountPath(path: string): boolean {
  return VERIFIED_ACCOUNT_EXACT_PATHS.has(path) || VERIFIED_ACCOUNT_PATHS.some((pattern) => pattern.test(path));
}

function isVerifiedCombatPath(path: string): boolean {
  return VERIFIED_COMBAT_EXACT_PATHS.has(path) || VERIFIED_COMBAT_PATHS.some((pattern) => pattern.test(path));
}

function sanitizeUrl(url: string): string {
  const parsed = new URL(url);
  return `${parsed.origin}${parsed.pathname}`;
}
