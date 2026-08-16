import type { DataQuality } from '../types/account.ts';
import type { PlannerCard, PlannerStep } from './model.ts';
import type { MaterialDeficit, RequirementSource } from '../planner/types.ts';

export const GOAL_PINS_STORAGE_KEY = 'gbfit:pinned-goals:v1';

export interface GoalPin {
  plannerKey: string;
  goalId: string;
  pinnedAt: number;
}

export interface GoalMaterialDeficit {
  key: string;
  name: string;
  source: RequirementSource;
  required: number;
  state: 'known' | 'unknown';
  owned?: number;
  missing?: number;
  itemId?: string;
  itemKindId?: string;
  group?: string;
  wikiTitle?: string;
}

export type GoalNextActionKind = 'farm' | 'prerequisite' | 'verify' | 'ready' | 'reached';

export interface GoalNextAction {
  kind: GoalNextActionKind;
  title: string;
  detail: string;
  quality: DataQuality;
  materialKey?: string;
}

export interface PinnedGoalSummary {
  key: string;
  pin: GoalPin;
  plannerKey: string;
  goalId: string;
  title: string;
  targetLabel: string;
  targetDisplay: string;
  targetReached?: boolean;
  quality: DataQuality;
  currentStep?: PlannerStep;
  remainingSteps: PlannerStep[];
  materials: GoalMaterialDeficit[];
  nextAction: GoalNextAction;
}

export interface ResolvedPinnedGoals {
  goals: PinnedGoalSummary[];
  stalePins: GoalPin[];
}

export function parseGoalPins(value: unknown): GoalPin[] {
  let raw: unknown = value;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw) as unknown;
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw)) return [];

  const byPlanner = new Map<string, GoalPin>();
  for (const candidate of raw) {
    if (!isRecord(candidate)) continue;
    const plannerKey = candidate.plannerKey;
    const goalId = candidate.goalId;
    const pinnedAt = candidate.pinnedAt;
    if (typeof plannerKey !== 'string' || plannerKey.length === 0) continue;
    if (typeof goalId !== 'string' || goalId.length === 0) continue;
    if (typeof pinnedAt !== 'number' || !Number.isFinite(pinnedAt) || pinnedAt < 0) continue;
    const existing = byPlanner.get(plannerKey);
    if (!existing || pinnedAt >= existing.pinnedAt) byPlanner.set(plannerKey, { plannerKey, goalId, pinnedAt });
  }
  return [...byPlanner.values()].sort((left, right) => left.pinnedAt - right.pinnedAt || left.plannerKey.localeCompare(right.plannerKey));
}

export function toggleGoalPin(
  pins: readonly GoalPin[],
  plannerKey: string,
  goalId: string,
  pinnedAt: number,
): GoalPin[] {
  const existing = pins.find((pin) => pin.plannerKey === plannerKey);
  if (existing?.goalId === goalId) return pins.filter((pin) => pin.plannerKey !== plannerKey);
  return [
    ...pins.filter((pin) => pin.plannerKey !== plannerKey),
    { plannerKey, goalId, pinnedAt },
  ].sort((left, right) => left.pinnedAt - right.pinnedAt || left.plannerKey.localeCompare(right.plannerKey));
}

export function isGoalPinned(pins: readonly GoalPin[], plannerKey: string, goalId: string): boolean {
  return pins.some((pin) => pin.plannerKey === plannerKey && pin.goalId === goalId);
}

export function resolvePinnedGoals(cards: readonly PlannerCard[], pins: readonly GoalPin[]): ResolvedPinnedGoals {
  const byKey = new Map(cards.map((card) => [card.key, card]));
  const goals: PinnedGoalSummary[] = [];
  const stalePins: GoalPin[] = [];

  for (const pin of pins) {
    const card = byKey.get(pin.plannerKey);
    if (!card) {
      stalePins.push(pin);
      continue;
    }
    const summary = resolvePinnedGoal(card, pin);
    if (!summary) stalePins.push(pin);
    else goals.push(summary);
  }
  return { goals, stalePins };
}

export function aggregatePinnedMaterialDeficits(goals: readonly PinnedGoalSummary[]): GoalMaterialDeficit[] {
  return aggregateMaterials(goals.flatMap((goal) => goal.targetReached === true ? [] : goal.materials));
}

export function goalMaterialQuality(materials: readonly GoalMaterialDeficit[]): DataQuality {
  if (materials.length === 0) return 'known';
  const known = materials.filter((material) => material.state === 'known').length;
  return known === materials.length ? 'known' : known === 0 ? 'unknown' : 'partial';
}

function resolvePinnedGoal(card: PlannerCard, pin: GoalPin): PinnedGoalSummary | undefined {
  const targetIndex = card.steps.findIndex((step) => step.goalId === pin.goalId);
  if (targetIndex < 0) return undefined;
  const target = card.steps[targetIndex]!;
  const targetReached = target.targetReached;
  const remainingSteps = targetReached === true
    ? []
    : card.steps.slice(0, targetIndex + 1).filter((step) => step.targetReached !== true);
  const materials = aggregateMaterials(remainingSteps.flatMap((step) => step.materialPlan.materials));
  const quality = goalQuality(targetReached, remainingSteps);
  const currentStep = remainingSteps[0];
  const nextAction = nextActionForGoal(card, target, targetReached, currentStep, quality);

  return {
    key: `${card.key}:${target.goalId}`,
    pin,
    plannerKey: card.key,
    goalId: target.goalId,
    title: card.title,
    targetLabel: target.targetLabel,
    targetDisplay: target.targetDisplay,
    targetReached,
    quality,
    currentStep,
    remainingSteps,
    materials,
    nextAction,
  };
}

function goalQuality(targetReached: boolean | undefined, steps: readonly PlannerStep[]): DataQuality {
  if (targetReached === true) return 'known';
  const signals: DataQuality[] = [targetReached === undefined ? 'unknown' : 'known'];
  for (const step of steps) {
    signals.push(step.materialPlan.quality);
    signals.push(step.targetReached === undefined ? 'unknown' : 'known');
    for (const evidence of step.prerequisiteEvidence) signals.push(evidence.state === 'known' ? 'known' : 'unknown');
  }
  return combineQuality(signals);
}

function nextActionForGoal(
  card: PlannerCard,
  target: PlannerStep,
  targetReached: boolean | undefined,
  currentStep: PlannerStep | undefined,
  quality: DataQuality,
): GoalNextAction {
  if (targetReached === true) {
    return {
      kind: 'reached',
      title: `${target.targetDisplay} reached`,
      detail: `${card.title} is already observed at this target.`,
      quality: 'known',
    };
  }
  if (!currentStep) {
    return {
      kind: 'verify',
      title: 'Verify progression state',
      detail: `No actionable modeled step can be proven for ${target.targetDisplay}.`,
      quality,
    };
  }

  const missing = currentStep.materialPlan.materials
    .filter((material): material is MaterialDeficit & { state: 'known'; missing: number } => material.state === 'known' && (material.missing ?? 0) > 0)
    .sort((left, right) => (right.missing ?? 0) - (left.missing ?? 0) || left.name.localeCompare(right.name));
  const firstMissing = missing[0];
  if (firstMissing) {
    return {
      kind: 'farm',
      title: `Farm ${firstMissing.name}`,
      detail: `${firstMissing.missing} missing for ${card.title} ${currentStep.targetDisplay}.`,
      quality: currentStep.materialPlan.quality,
      materialKey: materialKey(firstMissing),
    };
  }

  const blocker = currentStep.prerequisiteEvidence.find((evidence) => evidence.state === 'known' && evidence.satisfied === false);
  if (blocker) {
    return {
      kind: 'prerequisite',
      title: blocker.label,
      detail: `${card.title} ${currentStep.targetDisplay} has a proven unmet prerequisite${blocker.value ? ` · ${blocker.value}` : ''}.`,
      quality: currentStep.materialPlan.quality === 'known' ? 'known' : 'partial',
    };
  }

  const unknownMaterial = currentStep.materialPlan.materials.find((material) => material.state === 'unknown');
  if (currentStep.materialPlan.quality !== 'known' || unknownMaterial) {
    return {
      kind: 'verify',
      title: unknownMaterial ? `Verify ${unknownMaterial.name}` : 'Refresh material coverage',
      detail: `Material readiness for ${card.title} ${currentStep.targetDisplay} is not fully proven.`,
      quality: currentStep.materialPlan.quality,
    };
  }

  const unknownPrerequisite = currentStep.prerequisiteEvidence.find((evidence) => evidence.state === 'unknown');
  if (unknownPrerequisite) {
    return {
      kind: 'verify',
      title: `Verify ${unknownPrerequisite.label}`,
      detail: `${card.title} ${currentStep.targetDisplay} has incomplete prerequisite evidence.`,
      quality: 'partial',
    };
  }

  if (currentStep.materialPlan.complete === true && currentStep.prerequisiteEvidence.every((evidence) => evidence.state === 'known' && evidence.satisfied === true)) {
    return {
      kind: 'ready',
      title: `${currentStep.targetDisplay} materials ready`,
      detail: `All modeled material and prerequisite evidence for the current step is available and satisfied.`,
      quality: 'known',
    };
  }

  return {
    kind: 'verify',
    title: 'Verify current step',
    detail: `Readiness for ${card.title} ${currentStep.targetDisplay} cannot be proven from local evidence.`,
    quality,
  };
}

function aggregateMaterials(materials: readonly MaterialDeficit[] | readonly GoalMaterialDeficit[]): GoalMaterialDeficit[] {
  interface Bucket {
    sample: MaterialDeficit | GoalMaterialDeficit;
    required: number;
    states: Array<'known' | 'unknown'>;
    owned: number[];
  }
  const buckets = new Map<string, Bucket>();

  for (const material of materials) {
    const key = 'key' in material ? material.key : materialKey(material);
    const required = 'required' in material ? material.required : material.quantity;
    const existing = buckets.get(key);
    if (existing) {
      existing.required += required;
      existing.states.push(material.state);
      if (material.state === 'known' && material.owned !== undefined) existing.owned.push(material.owned);
    } else {
      buckets.set(key, {
        sample: material,
        required,
        states: [material.state],
        owned: material.state === 'known' && material.owned !== undefined ? [material.owned] : [],
      });
    }
  }

  return [...buckets.entries()].map(([key, bucket]) => {
    const known = bucket.states.every((state) => state === 'known');
    const ownedValues = new Set(bucket.owned);
    const ownershipConsistent = known && ownedValues.size === 1;
    const sample = bucket.sample;
    const base = {
      key,
      name: sample.name,
      source: sample.source,
      required: bucket.required,
      itemId: sample.itemId,
      itemKindId: sample.itemKindId,
      group: sample.group,
      wikiTitle: sample.wikiTitle,
    };
    if (!ownershipConsistent) return { ...base, state: 'unknown' as const };
    const owned = bucket.owned[0]!;
    return {
      ...base,
      state: 'known' as const,
      owned,
      missing: Math.max(0, bucket.required - owned),
    };
  }).sort((left, right) => {
    if (left.state !== right.state) return left.state === 'known' ? -1 : 1;
    if (left.state === 'known' && right.state === 'known' && left.missing !== right.missing) return (right.missing ?? 0) - (left.missing ?? 0);
    return left.name.localeCompare(right.name);
  });
}

function materialKey(material: Pick<MaterialDeficit, 'source' | 'itemId' | 'itemKindId' | 'group' | 'id' | 'name'>): string {
  if (material.itemId) return `${material.source}:${material.itemId}:${material.itemKindId ?? ''}:${material.group ?? ''}`;
  return `${material.source}:name:${material.name.trim().toLowerCase()}`;
}

function combineQuality(values: readonly DataQuality[]): DataQuality {
  if (values.length === 0) return 'unknown';
  if (values.every((value) => value === 'known')) return 'known';
  if (values.every((value) => value === 'unknown')) return 'unknown';
  return 'partial';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
