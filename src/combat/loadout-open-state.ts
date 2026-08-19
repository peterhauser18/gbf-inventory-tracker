export class CombatLoadoutOpenState {
  private readonly openOwners = new Set<string>();

  resolve(owner: string, currentOpen?: boolean): boolean {
    if (currentOpen !== undefined) this.remember(owner, currentOpen);
    return this.openOwners.has(owner);
  }

  remember(owner: string, open: boolean): void {
    if (open) this.openOwners.add(owner);
    else this.openOwners.delete(owner);
  }
}
