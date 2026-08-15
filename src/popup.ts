import './styles.css';
import {
  buildSanitizedExportBundle,
  captureExportFilename,
  serializeCaptureExport,
} from './capture/export.ts';
import { CAPTURE_CATEGORIES } from './capture/policy.ts';
import { getCapturedResponsesForScan } from './capture/storage.ts';
import type { CaptureControlMessage, CaptureStatusResponse } from './capture/types.ts';

const app = document.querySelector<HTMLElement>('#app');
if (!app) throw new Error('Missing #app root');

app.innerHTML = `
  <section class="shell">
    <header>
      <p class="eyebrow">LOCAL-FIRST GBF COMPANION</p>
      <h1>GBF Inventory Tracker</h1>
      <p class="muted">Account data is collected passively as you play and browse GBF normally.</p>
    </header>

    <button id="dashboard" class="secondary dashboard-button" type="button">Open Dashboard</button>

    <div class="card">
      <div class="status-row">
        <strong>Automatic account tracking</strong>
      </div>
      <p class="muted" id="tracking-note">Verified account responses are normalized locally. No extra GBF requests are sent.</p>
      <button id="reset-account" class="secondary" type="button">Reset account data</button>
    </div>

    <div class="card">
      <div class="status-row">
        <span class="dot" id="status-dot"></span>
        <strong id="status">Checking diagnostic scan status…</strong>
      </div>
      <p class="muted" id="detail">The manual scan is optional developer/diagnostic tooling.</p>
      <button id="toggle" type="button" disabled>Loading…</button>
    </div>

    <div class="card">
      <div class="status-row">
        <strong>Current / last diagnostic scan</strong>
        <span class="count" id="response-count">0 JSON responses</span>
      </div>
      <div class="grid" id="categories"></div>
      <p class="muted scan-note">“Seen” means a response candidate matched that category; it does not mean the category is complete.</p>
      <button id="export" class="secondary" type="button" disabled>Export sanitized scan</button>
      <p class="muted scan-note" id="export-note">Stop the diagnostic scan before exporting. The JSON file stays local until you explicitly share it.</p>
    </div>

    <footer>Normal use requires no scan workflow or menu checklist. Start a diagnostic scan only when you intentionally need a sanitized capture export.</footer>
  </section>
`;

const dashboardButton = requiredButton('#dashboard');
const resetAccountButton = requiredButton('#reset-account');
const trackingNote = requiredElement('#tracking-note');
const status = requiredElement('#status');
const detail = requiredElement('#detail');
const dot = requiredElement('#status-dot');
const toggle = requiredButton('#toggle');
const exportButton = requiredButton('#export');
const exportNote = requiredElement('#export-note');
const responseCount = requiredElement('#response-count');
const categories = requiredElement('#categories');

let latestStatus: CaptureStatusResponse | null = null;

dashboardButton.addEventListener('click', async () => {
  dashboardButton.disabled = true;
  try {
    await chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
  } finally {
    dashboardButton.disabled = false;
  }
});

resetAccountButton.addEventListener('click', async () => {
  if (!window.confirm('Clear GBF Tool\'s locally accumulated account data? This does not change your GBF account.')) return;
  resetAccountButton.disabled = true;
  trackingNote.textContent = 'Clearing local account data…';
  try {
    await sendMessage({ type: 'gbfit:reset-account-data' });
    trackingNote.textContent = 'Local account data cleared. Automatic tracking will rebuild it from future normal GBF activity.';
  } catch (error) {
    trackingNote.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    resetAccountButton.disabled = false;
  }
});

toggle.addEventListener('click', async () => {
  toggle.disabled = true;
  exportButton.disabled = true;
  const type = latestStatus?.active ? 'gbfit:stop-observation' : 'gbfit:start-observation';
  const response = await sendMessage({ type });
  render(response);
});

exportButton.addEventListener('click', async () => {
  const scan = latestStatus?.scan;
  if (!scan || scan.stoppedAt === undefined || latestStatus?.active) return;

  toggle.disabled = true;
  exportButton.disabled = true;
  exportNote.textContent = 'Preparing sanitized local export…';
  try {
    const records = await getCapturedResponsesForScan(scan.id);
    const exportedAt = Date.now();
    const bundle = buildSanitizedExportBundle(scan, records, exportedAt);
    downloadJson(captureExportFilename(exportedAt), serializeCaptureExport(bundle));
    exportNote.textContent = 'Sanitized JSON exported locally. Nothing was uploaded.';
  } catch (error) {
    exportNote.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    toggle.disabled = false;
    exportButton.disabled = false;
  }
});

void refresh();

async function refresh(): Promise<void> {
  render(await sendMessage({ type: 'gbfit:get-status' }));
}

async function sendMessage(message: CaptureControlMessage): Promise<CaptureStatusResponse> {
  try {
    return await chrome.runtime.sendMessage(message) as CaptureStatusResponse;
  } catch (error) {
    return {
      version: 1,
      captureReady: true,
      active: false,
      message: 'Background service unavailable',
      scan: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function render(response: CaptureStatusResponse): void {
  latestStatus = response;
  status.textContent = response.message;
  detail.textContent = response.error ?? 'The manual scan is optional developer/diagnostic tooling.';
  dot.classList.toggle('active', response.active);
  toggle.disabled = false;
  toggle.textContent = response.active ? 'Stop diagnostic scan' : 'Start diagnostic scan';
  responseCount.textContent = `${response.scan?.responseCount ?? 0} JSON responses`;

  const completed = !response.active && response.scan?.stoppedAt !== undefined;
  exportButton.disabled = !completed;
  exportNote.textContent = completed
    ? 'This export is sanitized again before download and stays local until you explicitly share it.'
    : 'Stop the diagnostic scan before exporting. The JSON file stays local until you explicitly share it.';

  categories.innerHTML = CAPTURE_CATEGORIES.map((category) => {
    const seen = response.scan?.categories[category] ?? false;
    return `<div class="stat"><span>${label(category)}</span><strong class="candidate ${seen ? 'seen' : ''}">${seen ? 'seen' : '—'}</strong></div>`;
  }).join('');
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

function label(category: (typeof CAPTURE_CATEGORIES)[number]): string {
  switch (category) {
    case 'characters': return 'Characters';
    case 'weapons': return 'Weapons';
    case 'summons': return 'Summons';
    case 'treasures': return 'Treasures';
    case 'progression': return 'Progression';
    case 'roster': return 'Roster inputs';
  }
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
