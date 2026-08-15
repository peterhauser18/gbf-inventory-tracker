import { isCaptureCandidate } from './policy.ts';
import type { ObservedResponse } from './types.ts';

export class CaptureEventBuffer {
  private readonly pending = new Map<string, ObservedResponse>();

  remember(meta: ObservedResponse): boolean {
    if (!isCaptureCandidate(meta)) return false;
    this.pending.set(meta.requestId, meta);
    return true;
  }

  take(requestId: string): ObservedResponse | null {
    const meta = this.pending.get(requestId) ?? null;
    this.pending.delete(requestId);
    return meta;
  }

  forget(requestId: string): void {
    this.pending.delete(requestId);
  }

  clear(): void {
    this.pending.clear();
  }
}
