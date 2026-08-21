type Obj = Record<string, unknown>;

export function isVerifiedWeaponStashMetadataResponseUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:'
      && parsed.hostname === 'game.granbluefantasy.jp'
      && parsed.pathname.startsWith('/container/content/list/');
  } catch {
    return false;
  }
}

export function parseObservedWeaponStashName(body: unknown): string | undefined {
  if (!obj(body) || typeof body.data !== 'string' || body.data.length === 0) return undefined;
  const html = safeDecodeURIComponent(body.data);
  const match = /class=["'][^"']*\bprt-container-name\b[^"']*["'][^>]*>\s*([^<]+?)\s*</i.exec(html);
  const raw = match?.[1]?.trim();
  if (!raw) return undefined;
  const decoded = decodeHtmlEntities(raw).trim();
  return decoded.length > 0 && decoded.length <= 120 ? decoded : undefined;
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function decodeHtmlEntities(value: string): string {
  return value.replace(/&(amp|lt|gt|quot|#39);/gi, (entity) => {
    switch (entity.toLowerCase()) {
      case '&amp;': return '&';
      case '&lt;': return '<';
      case '&gt;': return '>';
      case '&quot;': return '"';
      case '&#39;': return "'";
      default: return entity;
    }
  });
}

function obj(value: unknown): value is Obj {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
