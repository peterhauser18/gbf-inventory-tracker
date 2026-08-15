import './styles.css';
import { CAPTURE_CATEGORIES } from './capture/policy.ts';
import type { CaptureMessage, CaptureStatusResponse } from './capture/types.ts';

const app = document.querySelector<HTMLElement>('#app');
if (!app) throw new Error('Missing #app root');

app.innerHTML = `
  <section class="shell">
    <header>
      <p class="eyebrow">LOCAL-FIRST GBF COMPANION</p>
      <h1>GBF Inventory Tracker</h1>
      <p class="muted">Passively capture account data while you browse GBF normally.</p>
    </header>

    <div class="card">
      <div class="status-row">
        <span class="dot" id="status-dot"></span>
        <strong id="status">Checking extension status…</strong>
      </div>
      <p class="muted" id="detail">No gameplay automation. Captured account data stays on this device.</p>
      <button id="toggle" type="button" disabled>Loading…</button>
    </div>

    <div class="card">
      <div class="status-row">
        <strong>Current / last scan</strong>
        <span class="count" id="response-count">0 JSON responses</span>
      </div>
      <div class="grid" id="categories"></div>
      <p class="muted scan-note">“Seen” means a response candidate matched that category; it does not mean the category is complete.</p>
    </div>

    <footer>Start observation, click through the relevant GBF menus once, then stop observation.</footer>
  </section>
`;

const status = requiredElement('#status');
const detail = requiredElement('#detail');
const dot = requiredElement('#status-dot');
const toggle = requiredButton('#toggle');
const responseCount = requiredElement('#response-count');
const categories = requiredElement('#categories');

let latestStatus: CaptureStatusResponse | null = null;

toggle.addEventListener('click', async () => {
  toggle.disabled = true;
  const type = latestStatus?.active ? 'gbfit:stop-observation' : 'gbfit:start-observation';
  const response = await sendMessage({ type });
  render(response);
});

void refresh();

async function refresh(): Promise<void> {
  render(await sendMessage({ type: 'gbfit:get-status' }));
}

async function sendMessage(message: CaptureMessage): Promise<CaptureStatusResponse> {
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
  detail.textContent = response.error ?? 'No gameplay automation. Captured account data stays on this device.';
  dot.classList.toggle('active', response.active);
  toggle.disabled = false;
  toggle.textContent = response.active ? 'Stop observation' : 'Start observation';
  responseCount.textContent = `${response.scan?.responseCount ?? 0} JSON responses`;

  categories.innerHTML = CAPTURE_CATEGORIES.map((category) => {
    const seen = response.scan?.categories[category] ?? false;
    return `<div class="stat"><span>${label(category)}</span><strong class="candidate ${seen ? 'seen' : ''}">${seen ? 'seen' : '—'}</strong></div>`;
  }).join('');
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
