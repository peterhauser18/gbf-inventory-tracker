import {
  normalizeWikiTitle,
  selectSummonGameplay,
  type WikiAbilityText,
  type WikiGameplayMetadataIndex,
  type WikiSummonEffectText,
} from './wiki-gameplay-metadata.ts';
import type { EntityMetadataIndex } from './wiki-metadata.ts';

export type WikiDetailKind = 'CHARACTER' | 'WEAPON' | 'SUMMON';

export function renderWikiDetailGameplay(
  kind: WikiDetailKind,
  masterId: string,
  uncap: number | undefined,
  gameplay: WikiGameplayMetadataIndex,
  entities: EntityMetadataIndex,
): string {
  if (kind === 'CHARACTER') {
    return renderAbilitySection('Skills', gameplay.charactersById.get(masterId) ?? [], 'active skill');
  }

  if (kind === 'WEAPON') {
    const title = entities.weapons.get(masterId)?.wikiTitle;
    const abilities = title ? gameplay.weaponsByTitle.get(normalizeWikiTitle(title)) ?? [] : [];
    return renderAbilitySection('Weapon skills', abilities, 'weapon skill');
  }

  const summon = selectSummonGameplay(gameplay.summonsById.get(masterId), uncap);
  return `
    <div class="wiki-gameplay-group">
      <h4>Call</h4>
      ${summon.call ? renderSummonEffect(summon.call) : unavailableText('Call')}
    </div>
    <div class="wiki-gameplay-group">
      <h4>Aura</h4>
      ${summon.aura ? renderSummonEffect(summon.aura) : unavailableText('Aura')}
    </div>
  `;
}

export function unavailableWikiDetailText(label: string): string {
  return unavailableText(label);
}

function renderAbilitySection(heading: string, abilities: readonly WikiAbilityText[], noun: string): string {
  if (abilities.length === 0) {
    return `
      <div class="wiki-gameplay-group">
        <h4>${escapeHtml(heading)}</h4>
        ${unavailableText(heading)}
      </div>
    `;
  }
  return `
    <div class="wiki-gameplay-group">
      <h4>${escapeHtml(heading)}</h4>
      <div class="wiki-ability-list" aria-label="${escapeAttribute(heading)}">
        ${abilities.map(renderAbility).join('')}
      </div>
      <span class="wiki-source-note">Public GBF Wiki ${escapeHtml(noun)} text</span>
    </div>
  `;
}

function renderAbility(ability: WikiAbilityText): string {
  return `
    <article class="wiki-ability">
      <strong>${escapeHtml(ability.name)}</strong>
      <p>${escapeHtml(ability.description)}</p>
    </article>
  `;
}

function renderSummonEffect(effect: WikiSummonEffectText): string {
  return `
    <article class="wiki-ability">
      ${effect.name ? `<strong>${escapeHtml(effect.name)}</strong>` : ''}
      <p>${escapeHtml(effect.description)}</p>
    </article>
  `;
}

function unavailableText(label: string): string {
  return `<p class="wiki-gameplay-unavailable">${escapeHtml(label)} unavailable from current public Wiki metadata.</p>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  })[character] ?? character);
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}
