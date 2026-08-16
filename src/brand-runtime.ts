const brandIconUrl = chrome.runtime.getURL('icons/gbf-tracker-v2-48.png');

const observer = new MutationObserver(installBranding);
observer.observe(document.documentElement, { childList: true, subtree: true });
installBranding();

function installBranding(): void {
  const popupHeader = document.querySelector<HTMLElement>('#app header');
  if (popupHeader && !popupHeader.querySelector('[data-gbf-brand-icon]')) {
    popupHeader.prepend(brandImage('gbf-popup-brand-icon'));
    observer.disconnect();
    return;
  }

  const dashboardBrand = document.querySelector<HTMLElement>('#dashboard-app .sidebar .brand');
  if (!dashboardBrand || dashboardBrand.querySelector('[data-gbf-brand-icon]')) return;

  dashboardBrand.querySelector('.brand-mark')?.remove();
  dashboardBrand.prepend(brandImage('gbf-dashboard-brand-icon'));
  const heading = dashboardBrand.querySelector<HTMLElement>('h1');
  if (heading) heading.textContent = 'GBF Tracker';
  observer.disconnect();
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
