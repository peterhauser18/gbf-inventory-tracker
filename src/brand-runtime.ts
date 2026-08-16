const brandIconUrl = chrome.runtime.getURL('icons/gbf-tracker-v2-48.png');

const popupRoot = document.querySelector<HTMLElement>('#app');
if (popupRoot) {
  const popupObserver = new MutationObserver(() => {
    if (installPopupBranding(popupRoot)) popupObserver.disconnect();
  });
  popupObserver.observe(popupRoot, { childList: true });
  if (installPopupBranding(popupRoot)) popupObserver.disconnect();
}

const dashboardRoot = document.querySelector<HTMLElement>('#dashboard-app');
if (dashboardRoot) {
  const dashboardObserver = new MutationObserver(() => installDashboardBranding(dashboardRoot));
  dashboardObserver.observe(dashboardRoot, { childList: true });
  installDashboardBranding(dashboardRoot);
}

function installPopupBranding(root: HTMLElement): boolean {
  const header = root.querySelector<HTMLElement>('header');
  if (!header) return false;
  if (!header.querySelector('[data-gbf-brand-icon]')) {
    header.prepend(brandImage('gbf-popup-brand-icon'));
  }
  return true;
}

function installDashboardBranding(root: HTMLElement): void {
  const brand = root.querySelector<HTMLElement>('.sidebar .brand');
  if (!brand) return;

  if (!brand.querySelector('[data-gbf-brand-icon]')) {
    brand.querySelector('.brand-mark')?.remove();
    brand.prepend(brandImage('gbf-dashboard-brand-icon'));
  }

  const heading = brand.querySelector<HTMLElement>('h1');
  if (heading) heading.textContent = 'GBF Tracker';
}

function brandImage(className: string): HTMLImageElement {
  const image = document.createElement('img');
  image.className = className;
  image.dataset.gbfBrandIcon = 'true';
  image.src = brandIconUrl;
  image.alt = '';
  image.setAttribute('aria-hidden', 'true');
  image.draggable = false;
  return image;
}
