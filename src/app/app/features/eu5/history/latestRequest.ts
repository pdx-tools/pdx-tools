/** Keep one operation active and replace the pending target instead of building a backlog. */
export class LatestRequest<T, R> {
  private revision = 0;
  private next?: {
    value: T;
    revision: number;
    resolve: (value: R) => void;
    reject: (error: unknown) => void;
  };
  private active?: Promise<void>;
  constructor(private run: (value: T, current: () => boolean) => Promise<R>) {}
  request(value: T): Promise<R> {
    const revision = ++this.revision;
    this.next?.reject(new DOMException("Request replaced", "AbortError"));
    const result = new Promise<R>((resolve, reject) => {
      this.next = { value, revision, resolve, reject };
    });
    this.start();
    return result;
  }
  private start() {
    this.active ??= this.flush().finally(() => {
      this.active = undefined;
      if (this.next) this.start();
    });
  }
  private async flush() {
    while (this.next) {
      const job = this.next;
      this.next = undefined;
      try {
        const result = await this.run(job.value, () => this.revision === job.revision);
        if (this.revision !== job.revision)
          throw new DOMException("Request replaced", "AbortError");
        job.resolve(result);
      } catch (error) {
        job.reject(error);
      }
    }
  }
  async stop() {
    ++this.revision;
    this.next?.reject(new DOMException("Request stopped", "AbortError"));
    this.next = undefined;
    await this.active;
  }
}
