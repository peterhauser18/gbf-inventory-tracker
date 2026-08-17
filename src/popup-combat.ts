import { isGbfPageUrl } from './capture/policy.ts';

installCombatLauncher();
window.addEventListener('load', installCombatLauncher, { once: true });

function installCombatLauncher(): void {
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
