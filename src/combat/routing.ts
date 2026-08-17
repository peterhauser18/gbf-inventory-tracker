export interface CombatRouteIdentity {
  instanceId?: string;
}

export function selectCombatContextKey(
  contexts: Readonly<Record<string, CombatRouteIdentity>>,
  currentKey: string | undefined,
  directInstanceId: string | undefined,
): string | undefined {
  if (directInstanceId) {
    return Object.entries(contexts).find(([, context]) => context.instanceId === directInstanceId)?.[0];
  }
  return currentKey && contexts[currentKey] ? currentKey : undefined;
}
