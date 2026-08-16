import { clearWikiImageCache } from './wiki-image-loader.ts';

let installed = false;
let syncQueued = false;

export function installWikiImageCleanupControl(): void {
  if (installed || typeof document === 'undefined') return;
  const app = document.querySelector<HTMLElement>('#dashboard-app');
  if (!app) return;
  installed = true;
  const observer = new MutationObserver(scheduleSync);
  observer.observe(app, { childList: true, subtree: true });
  scheduleSync();
}

function scheduleSync(): void {
  if (syncQueued) return;
  syncQueued = true;
  queueMicrotask(() => {
    syncQueued = false;
    syncControl();
  });
}

function syncControl(): void {
  if (!document.querySelector('.nav-item.active[data-section="developer"]')) return;
  if (document.querySelector('[data-clear-wiki-image-cache]')) return;
  const card = Array.from(document.querySelectorAll<HTMLElement>('.system-card'))
    .find((candidate) => candidate.querySelector('h3')?.textContent?.trim() === 'Cleanup controls');
  if (!card) return;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'settings-action';
  button.dataset.clearWikiImageCache = 'true';
  button.textContent = 'Clear Wiki image cache';

  const status = document.createElement('p');
  status.className = 'muted';
  status.dataset.wikiImageCacheStatus = 'true';
  status.textContent = 'Removes only cached public GBF Wiki image bytes; account and analysis data are kept.';

  button.addEventListener('click', () => void clearFromDeveloper(button, status));
  card.append(button, status);
}

async function clearFromDeveloper(button: HTMLButtonElement, status: HTMLElement): Promise<void> {
  button.disabled = true;
  status.textContent = 'Clearing local Wiki image cache…';
  const cleared = await clearWikiImageCache();
  status.textContent = cleared
    ? 'Wiki image cache cleared. Images will be downloaded progressively again when their sections are opened.'
    : 'Wiki image cache was already unavailable or could not be cleared.';
  button.disabled = false;
}
