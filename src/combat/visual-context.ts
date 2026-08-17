import type { CapturedResponseRecord } from '../capture/types.ts';
import type { CombatActorContext, CombatParseContext } from './multiraid.ts';

type Obj = Record<string, unknown>;
type ActorWithVisual = CombatActorContext & { imageId?: string };

export function enrichObservedActorVisuals(
  record: CapturedResponseRecord,
  context: CombatParseContext | undefined,
): void {
  if (!context || !isVerifiedStart(record.meta.url)) return;
  const body = record.body;
  if (!isObject(body)) return;
  const params = at(body, 'player', 'param');
  if (!Array.isArray(params)) return;

  const visualByActorId = new Map<string, string>();
  for (const value of params) {
    if (!isObject(value)) continue;
    const actorId = text(value.pid);
    const imageId = safeAssetId(value.pid_image);
    if (actorId && imageId) visualByActorId.set(actorId, imageId);
  }
  if (!visualByActorId.size) return;

  for (const actor of context.actorSlots) attachObservedActorVisual(actor, visualByActorId.get(actor.id ?? ''));
  for (const actor of context.actors ?? []) attachObservedActorVisual(actor, visualByActorId.get(actor.id ?? ''));
}

export function actorVisualImageId(actor: CombatActorContext | undefined): string | undefined {
  return safeAssetId((actor as ActorWithVisual | undefined)?.imageId);
}

export function retainActorVisualId(
  source: CombatActorContext,
  target: CombatActorContext,
): CombatActorContext {
  const imageId = actorVisualImageId(source);
  if (imageId) (target as ActorWithVisual).imageId = imageId;
  return target;
}

function attachObservedActorVisual(actor: CombatActorContext, imageId: string | undefined): void {
  if (imageId) (actor as ActorWithVisual).imageId = imageId;
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
