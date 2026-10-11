/** Retain only a bounded number of parsed saves, releasing evictions immediately. */
export class PreparedSaves<T> {
  private entries = new Map<string, { value: T; bytes: number }>();
  active: string | null = null;
  constructor(
    private release: (value: T) => void,
    private budget = 768 * 1024 * 1024,
    private limit = 3,
  ) {}
  get(key: string) {
    const entry = this.entries.get(key);
    if (entry) {
      this.entries.delete(key);
      this.entries.set(key, entry);
    }
    return entry?.value;
  }
  makeRoom(bytes: number) {
    for (const [key, entry] of this.entries) {
      if (this.entries.size < this.limit && this.bytes + bytes <= this.budget) break;
      if (key === this.active) continue;
      this.entries.delete(key);
      this.release(entry.value);
    }
    return this.entries.size < this.limit && this.bytes + bytes <= this.budget;
  }
  add(key: string, value: T, bytes: number) {
    if (!this.makeRoom(bytes)) return false;
    this.entries.set(key, { value, bytes });
    return true;
  }
  get bytes() {
    return [...this.entries.values()].reduce((sum, entry) => sum + entry.bytes, 0);
  }
}
