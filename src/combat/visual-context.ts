import type { CapturedResponseRecord } from '../capture/types.ts';
import {
  rememberObservedEnemyIconAlias,
  rememberObservedRaidBossIcon,
} from '../enemy-icon-cache.ts';
import type { CombatActorContext, CombatParseContext } from './multiraid.ts';

type Obj = Record<string, unknown>;
type ActorWithVisual = CombatActorContext & { imageId?: string; cardImageId?: string };
type ObservedActorVisual = { battleImageId?: string; cardImageId?: string };

export function enrichObservedActorVisuals(
  record: CapturedResponseRecord,
  context: CombatParseContext | undefined,
): void {
  if (!context || !isVerifiedStart(record.meta.url)) return;
  const body = record.body;
  if (!isObject(body)) return;

  rememberObservedBossVisualAliases(body);

  const params = at(body, 'player', 'param');
  if (!Array.isArray(params)) return;

  const visualByActorId = new Map<string, ObservedActorVisual>();
  for (const value of params) {
    if (!isObject(value)) continue;
    const actorId = text(value.pid);
    const battleImageId = battleActorImageId(value);
    const cardImageId = safeAssetId(value.pid_image);
    if (actorId && (battleImageId || cardImageId)) {
      visualByActorId.set(actorId, { battleImageId, cardImageId });
    }
  }
  if (!visualByActorId.size) return;

  for (const actor of context.actorSlots) attachObservedActorVisual(actor, visualByActorId.get(actor.id ?? ''));
  for (const actor of context.actors ?? []) attachObservedActorVisual(actor, visualByActorId.get(actor.id ?? ''));
}

export function actorVisualImageId(actor: CombatActorContext | undefined): string | undefined {
  return safeAssetId((actor as ActorWithVisual | undefined)?.imageId);
}

export function actorCardImageId(actor: CombatActorContext | undefined): string | undefined {
  return safeAssetId((actor as ActorWithVisual | undefined)?.cardImageId);
}

export function retainActorVisualId(
  source: CombatActorContext,
  target: CombatActorContext,
): CombatActorContext {
  const imageId = actorVisualImageId(source);
  const cardImageId = actorCardImageId(source);
  if (imageId) (target as ActorWithVisual).imageId = imageId;
  if (cardImageId) (target as ActorWithVisual).cardImageId = cardImageId;
  return target;
}

export function bossImageAssetIdFromCjs(value: unknown): string | undefined {
  const cjs = text(value);
  if (!cjs) return undefined;
  return /^enemy_(\d+)(?:_[A-Za-z0-9_-]+)?$/i.exec(cjs)?.[1];
}

function rememberObservedBossVisualAliases(body: Obj): void {
  const params = at(body, 'boss', 'param');
  if (!Array.isArray(params)) return;
  for (const value of params) {
    if (!isObject(value)) continue;
    const assetId = bossImageAssetIdFromCjs(value.cjs);
    if (!assetId) continue;
    const enemyId = text(value.enemy_id);
    const bossName = localizedText(value.name);
    const questName = text(body.quest_name);
    if (enemyId) void rememberObservedEnemyIconAlias(enemyId, assetId);
    if (bossName) void rememberObservedRaidBossIcon(bossName, assetId);
    if (questName && questName !== bossName) void rememberObservedRaidBossIcon(questName, assetId);
    return;
  }
}

function battleActorImageId(value: Obj): string | undefined {
  const abilities = Array.isArray(value.ability) ? value.ability : [];
  for (const ability of abilities) {
    if (!isObject(ability)) continue;
    const assetId = battleDsAssetId(ability.src);
    if (assetId) return assetId;
  }
  return safeAssetId(value.pid_image);
}

function battleDsAssetId(value: unknown): string | undefined {
  const source = text(value);
  if (!source) return undefined;
  const match = /(?:^|\/)(?:leader|npc)\/ds\/([A-Za-z0-9_-]+)(?:\.(?:png|jpe?g|webp))?(?:[?#].*)?$/i.exec(source);
  return safeAssetId(match?.[1]);
}

function attachObservedActorVisual(actor: CombatActorContext, visual: ObservedActorVisual | undefined): void {
  if (visual?.battleImageId) (actor as ActorWithVisual).imageId = visual.battleImageId;
  if (visual?.cardImageId) (actor as ActorWithVisual).cardImageId = visual.cardImageId;
}

function isVerifiedStart(url: string): boolean {
  try {
    return new URL(url).pathname === '/rest/multiraid/start.json';
  } catch {
    return false;
  }
}

function safeAssetId(value: unknown): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const textValue = String(value).trim();
  return textValue && textValue.length <= 80 && /^[A-Za-z0-9_-]+$/.test(textValue) ? textValue : undefined;
}

function localizedText(value: unknown): string | undefined {
  if (isObject(value)) return text(value.en) ?? text(value.ja);
  return text(value);
}

function text(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

function at(source: Obj, ...keys: string[]): unknown {
  let value: unknown = source;
  for (const key of keys) {
    if (!isObject(value)) return undefined;
    value = value[key];
  }
  return value;
}

function isObject(value: unknown): value is Obj {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
