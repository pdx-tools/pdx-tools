/** String IDs are local to one packed observation; values are interned on demand. */
export class StringTable {
  readonly values: string[] = [];
  private readonly ids = new Map<string, number>();

  intern(value: string): number {
    const existing = this.ids.get(value);
    if (existing !== undefined) return existing;
    const id = this.values.length;
    this.values.push(value);
    this.ids.set(value, id);
    return id;
  }
}
