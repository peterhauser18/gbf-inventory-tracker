import './styles.css';

const app = document.querySelector<HTMLElement>('#app');

if (!app) throw new Error('Missing #app root');

app.innerHTML = `
  <section class="shell">
    <header>
      <p class="eyebrow">LOCAL-FIRST GBF COMPANION</p>
      <h1>GBF Inventory Tracker</h1>
      <p class="muted">Collection tracking + Eternal / Evoker planning.</p>
    </header>

    <div class="card">
      <div class="status-row">
        <span class="dot"></span>
        <strong id="status">Checking extension status…</strong>
      </div>
      <p class="muted">No gameplay automation. Account data stays local by default.</p>
    </div>

    <div class="grid">
      <div class="stat"><span>Characters</span><strong>—</strong></div>
      <div class="stat"><span>Weapons</span><strong>—</strong></div>
      <div class="stat"><span>Summons</span><strong>—</strong></div>
      <div class="stat"><span>Treasures</span><strong>—</strong></div>
    </div>

    <footer>Next: passive capture + endpoint discovery.</footer>
  </section>
`;

const status = document.querySelector<HTMLElement>('#status');

chrome.runtime.sendMessage({ type: 'gbfit:get-status' }, (response) => {
  if (!status) return;
  if (chrome.runtime.lastError) {
    status.textContent = 'Background service unavailable';
    return;
  }
  status.textContent = response?.message ?? 'Extension ready';
});
