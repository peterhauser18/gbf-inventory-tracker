const app = document.querySelector<HTMLElement>('#dashboard-app');
let syncQueued = false;
let storageBusy = false;
let openDeveloperAfterNavigation = false;

if (app) {
  app.addEventListener('click', handleClick, true);
  const observer = new MutationObserver(scheduleSync);
  observer.observe(app, { childList: true });
  scheduleSync();
}

function scheduleSync(): void {
  if (syncQueued) return;
  syncQueued = true;
  queueMicrotask(() => {
    syncQueued = false;
    syncUi();
  });
}

function syncUi(): void {
  if (!app) return;
  app.querySelector<HTMLElement>('.nav-item[data-section="developer"]')?.remove();
  if (!isSettingsActive()) return;
  ensureStorageCard();
  ensureDeveloperPanel();

  if (openDeveloperAfterNavigation) {
    const panel = app.querySelector<HTMLDetailsElement>('[data-settings-developer]');
    if (panel) {
      panel.open = true;
      panel.scrollIntoView({ block: 'nearest' });
      openDeveloperAfterNavigation = false;
    }
  }
}

function isSettingsActive(): boolean {
  return Boolean(app?.querySelector('.nav-item.active[data-section="settings"]'));
}

function ensureStorageCard(): void {
  const grid = app?.querySelector<HTMLElement>('.system-grid');
  if (!grid || grid.querySelector('[data-settings-storage]')) return;

  const card = document.createElement('article');
  card.className = 'system-card system-card-wide settings-storage-card';
  card.dataset.settingsStorage = 'true';
  card.innerHTML = `
    <p class="eyebrow">LOCAL STORAGE</p>
    <h3>Cleanup controls</h3>
    <p class="muted" data-settings-storage-note>Diagnostic scans are bounded locally. Cleanup affects only this extension's local data and never changes the GBF account.</p>
    <div class="settings-storage-actions">
      <button class="settings-action" type="button" data-settings-clear-diagnostic>Clear diagnostic storage</button>
      <button class="settings-action" type="button" data-settings-clear-except-account>Clear everything except account snapshot</button>
    </div>
  `;
  grid.append(card);
  void refreshStorageAvailability();
}

function ensureDeveloperPanel(): void {
  const grid = app?.querySelector<HTMLElement>('.system-grid');
  if (!grid || grid.querySelector('[data-settings-developer]')) return;

  const panel = document.createElement('details');
  panel.className = 'system-card system-card-wide developer-card settings-developer-card';
  panel.dataset.settingsDeveloper = 'true';
  panel.innerHTML = `
    <summary>
      <span>
        <span class="eyebrow">DEVELOPER</span>
        <strong>Developer</strong>
      </span>
      <span class="muted">Local diagnostics and observation boundary</span>
    </summary>
    <div class="settings-developer-body">
      <div class="status-list">
        <div><span>Observation control</span><strong>Extension popup</strong></div>
        <div><span>Account reset</span><strong>Extension popup</strong></div>
        <div><span>Storage cleanup</span><strong>Settings above</strong></div>
      </div>
      <p class="muted">Manual observation and account reset stay in the popup. The removed current/last-observation panel is not reproduced here.</p>
    </div>
  `;
  grid.append(panel);
}

function handleClick(event: MouseEvent): void {
  const target = event.target as Element | null;
  if (!target) return;

  if (target.closest('.nav-item[data-section="developer"], [data-command-destination="developer"]')) {
    event.preventDefault();
    event.stopImmediatePropagation();
    openDeveloperAfterNavigation = true;
    app?.querySelector<HTMLButtonElement>('.nav-item[data-section="settings"]')?.click();
    scheduleSync();
    return;
  }

  if (target.closest('[data-settings-clear-diagnostic]')) {
    event.preventDefault();
    event.stopImmediatePropagation();
    void runCleanup('gbfit:clear-diagnostic-data');
    return;
  }

  if (target.closest('[data-settings-clear-except-account]')) {
    event.preventDefault();
    event.stopImmediatePropagation();
    void runCleanup('gbfit:clear-all-except-account');
  }
}

async function refreshStorageAvailability(): Promise<void> {
  const response = await sendMessage('gbfit:get-status');
  if (response.error) {
    setStorageNote(response.error);
    return;
  }
  setStorageButtonsDisabled(Boolean(response.active));
  if (response.active) {
    setStorageNote('Stop observation before clearing local storage so in-flight observed data cannot immediately repopulate it.');
  }
}

async function runCleanup(type: 'gbfit:clear-diagnostic-data' | 'gbfit:clear-all-except-account'): Promise<void> {
  if (storageBusy) return;
  const status = await sendMessage('gbfit:get-status');
  if (status.error) {
    setStorageNote(status.error);
    return;
  }
  if (status.active) {
    setStorageButtonsDisabled(true);
    setStorageNote('Stop observation before clearing local storage so in-flight observed data cannot immediately repopulate it.');
    return;
  }

  const isDiagnosticOnly = type === 'gbfit:clear-diagnostic-data';
  const confirmed = window.confirm(isDiagnosticOnly
    ? 'Clear all locally stored diagnostic scans? The account snapshot, combat history, drop preferences, and UI preferences will be kept.'
    : 'Delete diagnostic scans, combat/raid history, and drop preferences? The normalized account snapshot and UI preferences will be kept.');
  if (!confirmed) return;

  storageBusy = true;
  setStorageButtonsDisabled(true);
  setStorageNote(isDiagnosticOnly ? 'Clearing diagnostic storage…' : 'Clearing local data except the account snapshot…');
  const response = await sendMessage(type);
  storageBusy = false;
  setStorageButtonsDisabled(false);
  setStorageNote(response.error ?? (isDiagnosticOnly
    ? 'Diagnostic storage cleared. Account snapshot and combat data were kept.'
    : 'Diagnostic and combat data cleared. Account snapshot and UI preferences were kept.'));
}

function setStorageButtonsDisabled(disabled: boolean): void {
  app?.querySelectorAll<HTMLButtonElement>('[data-settings-storage] button').forEach((button) => {
    button.disabled = disabled || storageBusy;
  });
}

function setStorageNote(message: string): void {
  const note = app?.querySelector<HTMLElement>('[data-settings-storage-note]');
  if (note) note.textContent = message;
}

async function sendMessage(type: string): Promise<{ active?: boolean; error?: string }> {
  try {
    return await chrome.runtime.sendMessage({ type }) as { active?: boolean; error?: string };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
