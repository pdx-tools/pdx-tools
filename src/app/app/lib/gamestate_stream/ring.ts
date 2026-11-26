/**
 * A ring of chunks in a `SharedArrayBuffer` that passes a byte stream from
 * one worker to another: one writer and one reader. Each side blocks with
 * `Atomics.wait`, so neither side may run on the main thread.
 *
 * A slot holds one chunk and its length. A length of 0 ends the stream, and
 * a negative length `~n` holds an error message of `n` bytes.
 */

const HEAD = 0; // slots published
const TAIL = 1; // slots consumed
const SLOTS = 2;
const SLOT_BYTES = 3;
const HEADER_BYTES = 16;

/**
 * Create a ring of `slots` slots of `slotBytes` each. A writer whose chunks
 * match `slotBytes` fills one slot per chunk; larger chunks are split.
 */
export function createChunkRing(slots = 16, slotBytes = 1024 * 1024): SharedArrayBuffer {
  const buffer = new SharedArrayBuffer(HEADER_BYTES + slots * 4 + slots * slotBytes);
  const ctrl = new Int32Array(buffer, 0, HEADER_BYTES / 4);
  ctrl[SLOTS] = slots;
  ctrl[SLOT_BYTES] = slotBytes;
  return buffer;
}

class Ring {
  readonly ctrl: Int32Array<SharedArrayBuffer>;
  readonly lens: Int32Array<SharedArrayBuffer>;
  readonly data: Uint8Array<SharedArrayBuffer>;
  readonly slots: number;
  readonly slotBytes: number;

  constructor(buffer: SharedArrayBuffer) {
    this.ctrl = new Int32Array(buffer, 0, HEADER_BYTES / 4);
    this.slots = this.ctrl[SLOTS];
    this.slotBytes = this.ctrl[SLOT_BYTES];
    this.lens = new Int32Array(buffer, HEADER_BYTES, this.slots);
    this.data = new Uint8Array(buffer, HEADER_BYTES + this.slots * 4);
  }

  slotStart(index: number) {
    return (index % this.slots) * this.slotBytes;
  }
}

export class ChunkWriter {
  readonly #ring: Ring;
  #head = 0;

  constructor(buffer: SharedArrayBuffer) {
    this.#ring = new Ring(buffer);
  }

  /** Copy `chunk` into the ring. Block while the ring is full. */
  write(chunk: Uint8Array) {
    const { slotBytes } = this.#ring;
    for (let at = 0; at < chunk.length; at += slotBytes) {
      this.#publish(chunk.subarray(at, at + slotBytes));
    }
  }

  /** End the stream. */
  close() {
    this.#publish(new Uint8Array());
  }

  /** End the stream with an error that the reader throws. */
  fail(message: string) {
    const bytes = new TextEncoder().encode(message).subarray(0, this.#ring.slotBytes);
    this.#publish(bytes, ~bytes.length);
  }

  #publish(bytes: Uint8Array, len = bytes.length) {
    const { ctrl, lens, data, slots } = this.#ring;
    const head = this.#head;
    let tail = Atomics.load(ctrl, TAIL);
    while (head - tail >= slots) {
      Atomics.wait(ctrl, TAIL, tail);
      tail = Atomics.load(ctrl, TAIL);
    }

    data.set(bytes, this.#ring.slotStart(head));
    lens[head % slots] = len;
    this.#head = head + 1;
    Atomics.store(ctrl, HEAD, this.#head);
    Atomics.notify(ctrl, HEAD);
  }
}

export class ChunkReader {
  readonly #ring: Ring;
  readonly #timeoutMs: number;
  #tail = 0;
  #offset = 0;

  /** Throw when no chunk arrives within `timeoutMs`, as the writer is gone. */
  constructor(buffer: SharedArrayBuffer, timeoutMs = 60_000) {
    this.#ring = new Ring(buffer);
    this.#timeoutMs = timeoutMs;
  }

  /**
   * Fill `buf` from its start and return the byte count, or 0 at the end.
   * The last slot is never released, so later reads end or throw again.
   */
  read(buf: Uint8Array): number {
    const { ctrl, lens, data, slots } = this.#ring;
    while (Atomics.load(ctrl, HEAD) === this.#tail) {
      if (Atomics.wait(ctrl, HEAD, this.#tail, this.#timeoutMs) === "timed-out") {
        throw new Error("Timed out while waiting for the stream writer");
      }
    }

    const len = lens[this.#tail % slots];
    const start = this.#ring.slotStart(this.#tail);
    if (len < 0) {
      // TextDecoder does not accept a view of shared memory.
      throw new Error(new TextDecoder().decode(data.slice(start, start + ~len)));
    }

    const n = Math.min(buf.length, len - this.#offset);
    buf.set(data.subarray(start + this.#offset, start + this.#offset + n));
    this.#offset += n;
    if (len > 0 && this.#offset === len) {
      this.#offset = 0;
      this.#tail += 1;
      Atomics.store(ctrl, TAIL, this.#tail);
      Atomics.notify(ctrl, TAIL);
    }
    return n;
  }
}
