import type { DashboardCard } from './model.ts';

export interface InlineStashRow {
  stash: DashboardCard;
  visibleChildren: DashboardCard[];
  expanded: boolean;
  forcedByChildMatch: boolean;
}

export function selectInlineStashes(
  stashes: readonly DashboardCard[],
  query: string,
  expandedKeys: ReadonlySet<string>,
): InlineStashRow[] {
  const normalized = query.trim().toLowerCase();
  const rows: InlineStashRow[] = [];

  for (const stash of stashes) {
    const children = stash.children ?? [];
    if (!normalized) {
      rows.push({
        stash,
        visibleChildren: children,
        expanded: expandedKeys.has(stash.key),
        forcedByChildMatch: false,
      });
      continue;
    }

    const stashMatches = cardMatchesQuery(stash, normalized);
    const matchingChildren = children.filter((child) => cardMatchesQuery(child, normalized));
    if (!stashMatches && matchingChildren.length === 0) continue;

    const forcedByChildMatch = matchingChildren.length > 0;
    rows.push({
      stash,
      visibleChildren: stashMatches ? children : matchingChildren,
      expanded: expandedKeys.has(stash.key) || forcedByChildMatch,
      forcedByChildMatch,
    });
  }

  return rows;
}

export function renderInlineStashCollection(
  stashes: readonly DashboardCard[],
  query: string,
  expandedKeys: ReadonlySet<string>,
): string {
  const rows = selectInlineStashes(stashes, query, expandedKeys);
  if (rows.length === 0) {
    return `<div class="empty"><strong>No matching entries</strong><span>${stashes.length === 0 ? 'No weapon stashes were observed yet.' : 'Try a different search.'}</span></div>`;
  }

  return `
    <div class="result-count">Showing ${escapeHtml(formatNumber(rows.length))} of ${escapeHtml(formatNumber(stashes.length))} stashes</div>
    <section class="stash-list">
      ${rows.map(renderStashRow).join('')}
    </section>
  `;
}

function renderStashRow(row: InlineStashRow): string {
  const childCount = row.stash.children?.length ?? 0;
  const childLabel = childCount === 1 ? '1 weapon' : `${formatNumber(childCount)} weapons`;
  return `
    <article class="stash-card ${row.expanded ? 'expanded' : ''}" data-stash-card="${escapeAttribute(row.stash.key)}">
      <div class="stash-head">
        <button
          class="stash-toggle"
          type="button"
          data-stash-toggle="${escapeAttribute(row.stash.key)}"
          aria-expanded="${row.expanded}"
          aria-label="${row.expanded ? 'Collapse' : 'Expand'} ${escapeAttribute(row.stash.title)}"
        >
          ${renderVisual(row.stash, true)}
          <span class="stash-copy">
            <strong>${escapeHtml(row.stash.title)}</strong>
            <span>${escapeHtml(row.stash.subtitle)}</span>
            <small>${escapeHtml(childLabel)}${row.forcedByChildMatch ? ' · matching child shown' : ''}</small>
          </span>
          <span class="stash-chevron" aria-hidden="true">${row.expanded ? '−' : '+'}</span>
        </button>
        <a class="stash-wiki" href="${escapeAttribute(row.stash.wikiUrl)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">Wiki ↗</a>
      </div>
      ${row.expanded ? renderChildren(row) : ''}
    </article>
  `;
}

function renderChildren(row: InlineStashRow): string {
  if (row.visibleChildren.length === 0) {
    return '<div class="stash-empty">No contained weapons were observed for this stash.</div>';
  }
  return `
    <div class="stash-children" data-stash-children="${escapeAttribute(row.stash.key)}">
      <div class="stash-child-count">${escapeHtml(formatNumber(row.visibleChildren.length))} ${row.visibleChildren.length === 1 ? 'weapon' : 'weapons'} shown</div>
      <div class="stash-weapon-grid">
        ${row.visibleChildren.map((child) => renderWeaponCard(child, row.stash.key)).join('')}
      </div>
    </div>
  `;
}

function renderWeaponCard(card: DashboardCard, stashKey: string): string {
  return `
    <article class="entity-card stash-weapon-card" data-stash-parent="${escapeAttribute(stashKey)}" data-stash-child="${escapeAttribute(card.key)}">
      <button class="card-open" type="button" data-detail="${escapeAttribute(card.key)}">
        ${renderVisual(card)}
        <span class="card-copy">
          <strong>${escapeHtml(card.title)}</strong>
          <span>${escapeHtml(card.subtitle)}</span>
          <span class="card-meta"><span class="stash-provenance">In this stash</span></span>
        </span>
      </button>
      <a class="wiki-link" href="${escapeAttribute(card.wikiUrl)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer" aria-label="Open ${escapeAttribute(card.title)} on GBF Wiki">Wiki ↗</a>
    </article>
  `;
}

function cardMatchesQuery(card: DashboardCard, normalized: string): boolean {
  return [card.title, card.subtitle, card.key, ...card.detailFields.map((field) => field.value)]
    .some((candidate) => candidate.toLowerCase().includes(normalized));
}

function renderVisual(card: DashboardCard, compact = false): string {
  const classes = ['entity-visual', card.kind, compact ? 'compact' : ''].filter(Boolean).join(' ');
  const placeholder = `<span class="placeholder" aria-hidden="true">${escapeHtml(initials(card.title))}</span>`;
  if (!card.imageUrl) return `<span class="${classes}">${placeholder}</span>`;
  return `<span class="${classes}">${placeholder}<img data-entity-image src="${escapeAttribute(card.imageUrl)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" /></span>`;
}

function initials(value: string): string {
  const words = value.split(/\s+/).filter(Boolean);
  return (words.length > 1 ? `${words[0]?.[0] ?? ''}${words[1]?.[0] ?? ''}` : value.slice(0, 2)).toUpperCase();
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  })[character] ?? character);
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}
