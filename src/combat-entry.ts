import './dashboard/theme.css';
import './dashboard/styles.css';
import './combat/standalone.css';
import './combat/ui.ts';
import './combat/combat-compare-ui.ts';
import {
  clearRawCombatCapture,
  enableRawCombatCapture,
  getRawCombatCaptureExport,
  getRawCombatCaptureStatus,
  rawCombatCaptureFilename,
  serializeRawCombatCaptureExport,
} from './combat/raw-capture.ts';
import { DASHBOARD_THEME_STORAGE_KEY, parseDashboardTheme } from './dashboard/theme.ts';

applyStoredTheme();

document.querySelector<HTMLButtonElement>('.combat-standalone-tabs .nav-item[data-section="combat"]')?.click();

if (new URLSearchParams(window.location.search).get('rawCapture') === '1') {
  void installRawCaptureMode();
}

function applyStoredTheme(): void {
  let theme: 'light' | 'dark' = 'dark';
  try {
    theme = parseDashboardTheme(localStorage.getItem(DASHBOARD_THEME_STORAGE_KEY));
  } catch {
    // Keep the dark first paint when localStorage is unavailable.
  }
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

async function installRawCaptureMode(): Promise<void> {
  const shell = document.querySelector<HTMLElement>('.combat-standalone-shell');
  if (!shell || document.querySelector('#raw-combat-capture-banner')) return;
  shell.classList.add('raw-capture-shell');

  const banner = document.createElement('section');
  banner.id = 'raw-combat-capture-banner';
  banner.className = 'raw-capture-banner';
  banner.innerHTML = `
    <div class="raw-capture-copy">
      <strong>RAW CAPTURE MODE</strong>
      <span id="raw-capture-status">Starting local raw combat capture…</span>
      <small>Stores verified combat JSON response bodies locally for parser debugging. Credential-like field values are replaced with [redacted]; failed body reads retain only sanitized path, time, and a fixed failure reason.</small>
    </div>
    <div class="raw-capture-actions">
      <button id="raw-capture-export" type="button" disabled>Export Raw JSON</button>
      <button id="raw-capture-clear" class="secondary" type="button">Clear Raw Capture</button>
    </div>
  `;
  shell.prepend(banner);

  const status = requiredElement('#raw-capture-status');
  const exportButton = requiredButton('#raw-capture-export');
  const clearButton = requiredButton('#raw-capture-clear');

  try {
    const ownerTabId = (await chrome.tabs.getCurrent())?.id;
    if (ownerTabId !== undefined) await enableRawCombatCapture(ownerTabId, false);
  } catch (error) {
    status.textContent = `Raw capture could not be enabled: ${error instanceof Error ? error.message : String(error)}`;
  }

  const refresh = async (): Promise<void> => {
    const current = await getRawCombatCaptureStatus();
    exportButton.disabled = current.count === 0 && current.readFailureCount === 0;
    const redactions = current.redactedSensitiveFields
      ? `; ${current.redactedSensitiveFields} credential-like field${current.redactedSensitiveFields === 1 ? '' : 's'} redacted`
      : '';
    const failures = current.readFailureCount
      ? `; ${current.readFailureCount} response-body read failure${current.readFailureCount === 1 ? '' : 's'} retained`
      : '';
    status.textContent = current.enabled
      ? `${current.count} raw combat response${current.count === 1 ? '' : 's'} retained locally${redactions}${failures}.`
      : 'Raw capture is inactive. Re-open this mode from the extension popup to start a fresh session.';
  };

  exportButton.addEventListener('click', async () => {
    exportButton.disabled = true;
    try {
      const exportedAt = Date.now();
      const bundle = await getRawCombatCaptureExport(exportedAt);
      downloadJson(rawCombatCaptureFilename(exportedAt), serializeRawCombatCaptureExport(bundle));
      status.textContent = `Exported ${bundle.records.length} raw combat response${bundle.records.length === 1 ? '' : 's'} and ${bundle.readFailures.length} body-read failure${bundle.readFailures.length === 1 ? '' : 's'} locally.`;
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : String(error);
    } finally {
      await refresh();
    }
  });

  clearButton.addEventListener('click', async () => {
    if (!window.confirm('Clear all locally retained raw combat responses and read-failure diagnostics from this capture session?')) return;
    clearButton.disabled = true;
    try {
      await clearRawCombatCapture();
      await refresh();
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : String(error);
    } finally {
      clearButton.disabled = false;
    }
  });

  window.addEventListener('focus', () => { void refresh(); });
  window.setInterval(() => { void refresh(); }, 1000);
  await refresh();
}

function downloadJson(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function requiredButton(selector: string): HTMLButtonElement {
  const element = document.querySelector<HTMLButtonElement>(selector);
  if (!element) throw new Error(`Missing ${selector}`);
  return element;
}

function requiredElement(selector: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`Missing ${selector}`);
  return element;
}
