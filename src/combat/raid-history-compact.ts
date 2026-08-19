import './raid-history-compact.css';

const RAIDS_PER_PAGE = 5;
const PAGE_BUTTONS = 5;
let currentPage = 1;
let lastQuery = '';

export function applyCompactRaidHistory(root: HTMLElement, query: string): void {
  const list = root.querySelector<HTMLElement>('.raid-list');
  if (!list) return;

  if (query !== lastQuery) {
    lastQuery = query;
    currentPage = 1;
  }

  const cards = [...list.querySelectorAll<HTMLElement>(':scope > .raid-card')];
  const totalPages = Math.max(1, Math.ceil(cards.length / RAIDS_PER_PAGE));
  currentPage = Math.min(Math.max(1, currentPage), totalPages);

  const start = (currentPage - 1) * RAIDS_PER_PAGE;
  const end = start + RAIDS_PER_PAGE;
  cards.forEach((card, index) => {
    card.hidden = index < start || index >= end;
  });

  root.querySelector('[data-raid-pagination]')?.remove();
  if (cards.length > RAIDS_PER_PAGE) {
    const pagination = renderPagination(totalPages);
    list.insertAdjacentElement('afterend', pagination);
  }

  const toolbar = root.querySelector<HTMLElement>('.raid-toolbar');
  if (toolbar) {
    toolbar.classList.add('raid-toolbar-bottom');
    root.append(toolbar);
  }
}

function renderPagination(totalPages: number): HTMLElement {
  const nav = document.createElement('nav');
  nav.className = 'raid-pagination';
  nav.dataset.raidPagination = 'true';
  nav.setAttribute('aria-label', 'Raid history pages');

  nav.append(pageButton('‹', currentPage - 1, currentPage <= 1, 'Previous page'));
  for (const page of visiblePages(totalPages)) {
    nav.append(pageButton(String(page), page, false, `Page ${page}`, page === currentPage));
  }
  nav.append(pageButton('›', currentPage + 1, currentPage >= totalPages, 'Next page'));
  return nav;
}

function pageButton(label: string, page: number, disabled: boolean, ariaLabel: string, active = false): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `raid-page-button${active ? ' active' : ''}`;
  button.textContent = label;
  button.disabled = disabled;
  button.setAttribute('aria-label', ariaLabel);
  if (active) button.setAttribute('aria-current', 'page');
  button.addEventListener('click', () => {
    currentPage = page;
    const root = button.closest<HTMLElement>('[data-combat-section]');
    if (root) applyCompactRaidHistory(root, lastQuery);
  });
  return button;
}

function visiblePages(totalPages: number): number[] {
  if (totalPages <= PAGE_BUTTONS) return Array.from({ length: totalPages }, (_, index) => index + 1);
  const half = Math.floor(PAGE_BUTTONS / 2);
  const first = Math.min(Math.max(1, currentPage - half), totalPages - PAGE_BUTTONS + 1);
  return Array.from({ length: PAGE_BUTTONS }, (_, index) => first + index);
}
