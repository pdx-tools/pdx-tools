type Waiter = {
  bytes: number;
  resolve: (release: () => void) => void;
  signal?: AbortSignal;
  onAbort: () => void;
};

/**
 * One memory budget for all save parsers in the tab, for all games. A parser
 * gets a slot when its peak estimate fits next to the active parsers and the
 * resident data. One parser can always run. Slots go in request order.
 */
export class ParserAdmission {
  private resident = new Map<string, number>();
  private reserved = 0;
  private active = 0;
  private waiting: Waiter[] = [];

  constructor(private readonly budgetBytes: number) {}

  /** Set the resident bytes of one analysis session. */
  setResident(session: string, bytes: number) {
    if (bytes > 0) this.resident.set(session, bytes);
    else this.resident.delete(session);
    this.grant();
  }

  /** Wait for a parser slot. Call the release function when the parse output is stored. */
  acquire(bytes: number, signal?: AbortSignal): Promise<() => void> {
    if (signal?.aborted) return Promise.reject(signal.reason);
    return new Promise((resolve, reject) => {
      const waiter: Waiter = {
        bytes,
        resolve,
        signal,
        onAbort: () => {
          this.waiting.splice(this.waiting.indexOf(waiter), 1);
          reject(signal!.reason);
          // A larger waiter at the front can block smaller ones behind it.
          this.grant();
        },
      };
      signal?.addEventListener("abort", waiter.onAbort, { once: true });
      this.waiting.push(waiter);
      this.grant();
    });
  }

  usage() {
    let residentBytes = 0;
    for (const bytes of this.resident.values()) residentBytes += bytes;
    return { active: this.active, reservedBytes: this.reserved, residentBytes };
  }

  private grant() {
    for (let waiter = this.waiting[0]; waiter; waiter = this.waiting[0]) {
      const { reservedBytes, residentBytes } = this.usage();
      if (this.active && reservedBytes + residentBytes + waiter.bytes > this.budgetBytes) return;
      this.waiting.shift();
      waiter.signal?.removeEventListener("abort", waiter.onAbort);
      this.active++;
      this.reserved += waiter.bytes;
      let released = false;
      waiter.resolve(() => {
        if (released) return;
        released = true;
        this.active--;
        this.reserved -= waiter.bytes;
        this.grant();
      });
    }
  }
}

/** About two thirds of the device memory, less 512 MiB for the page. */
export function parserBudget(deviceMemoryGiB = 4) {
  return Math.max(0, deviceMemoryGiB * 0.65 * 1024 ** 3 - 512 * 1024 ** 2);
}

let shared: ParserAdmission | undefined;
/** The admission for this tab. */
export function parserAdmission() {
  return (shared ??= new ParserAdmission(
    parserBudget((navigator as Navigator & { deviceMemory?: number }).deviceMemory),
  ));
}
