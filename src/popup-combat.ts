import { isGbfPageUrl } from './capture/policy.ts';
import { enableRawCombatCapture } from './combat/raw-capture.ts';

installCombatLauncher();
window.addEventListener('load', installCombatLauncher, { once: true });

function installCombatLauncher(): void {
  installStandaloneCombatButton();
  installRawCaptureButton();
}

function installStandaloneCombatButton(): void {
  if (document.querySelector('#combat-tracker')) return;
  const dashboardButton = document.querySelector<HTMLButtonElement>('#dashboard');
  if (!dashboardButton) return;

  const combatButton = document.createElement('button');
  combatButton.id = 'combat-tracker';
  combatButton.className = 'dashboard-button';
  combatButton.type = 'button';
  combatButton.title = 'Open the standalone Combat Tracker and Raid History view.';
  combatButton.textContent = 'Open Combat Tracker';
  dashboardButton.insertAdjacentElement('afterend', combatButton);

  combatButton.addEventListener('click', async () => {
    combatButton.disabled = true;
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id !== undefined && isGbfPageUrl(tab.url)) {
        void chrome.runtime.sendMessage({ type: 'gbfit:start-observation', tabId: tab.id }).catch(() => {});
      }
      await chrome.tabs.create({ url: chrome.runtime.getURL('combat.html') });
    } catch (error) {
      combatButton.title = `Could not open Combat Tracker: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      combatButton.disabled = false;
    }
  });
}

function installRawCaptureButton(): void {
  if (document.querySelector('#combat-tracker-raw')) return;
  const developerContent = document.querySelector<HTMLElement>('.developer-content');
  if (!developerContent) return;

  const rawButton = document.createElement('button');
  rawButton.id = 'combat-tracker-raw';
  rawButton.className = 'dashboard-button';
  rawButton.type = 'button';
  rawButton.title = 'Open Combat Tracker Raw Capture Mode. Verified combat gameplay JSON is retained locally for parser debugging; credential-like response values are redacted in place.';
  rawButton.textContent = 'Open Combat Tracker Raw Capture Mode';
  developerContent.prepend(rawButton);

  rawButton.addEventListener('click', async () => {
    rawButton.disabled = true;
    try {
      const [gbfTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const rawTab = await chrome.tabs.create({ url: chrome.runtime.getURL('combat.html?rawCapture=1') });
      if (rawTab.id === undefined) throw new Error('Chrome did not return the Raw Capture tab id.');

      await enableRawCombatCapture(rawTab.id, true);
      if (gbfTab?.id !== undefined && isGbfPageUrl(gbfTab.url)) {
        void chrome.runtime.sendMessage({ type: 'gbfit:start-observation', tabId: gbfTab.id }).catch(() => {});
      }
    } catch (error) {
      rawButton.title = `Could not open Raw Capture Mode: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      rawButton.disabled = false;
    }
  });
}
