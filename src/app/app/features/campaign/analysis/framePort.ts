import { collectBuffers } from "./transferBuffers";

type Request = { id: number; snapshotId: string };
type Reply<F> = { id: number; frame?: F; error?: string; closed?: boolean };

/**
 * Serve frames from the analysis worker to a game worker. Each reply sends a
 * copy, so the resident columns stay in the store. The game builds the frame.
 */
export function serveFrames<F>(port: MessagePort, lookup: (snapshotId: string) => F) {
  const receive = (event: MessageEvent<Request>) => {
    const { id, snapshotId } = event.data;
    try {
      const frame = structuredClone(lookup(snapshotId));
      port.postMessage({ id, frame } satisfies Reply<F>, collectBuffers(frame));
    } catch (error) {
      port.postMessage({ id, error: String(error) } satisfies Reply<F>);
    }
  };
  port.addEventListener("message", receive);
  port.start();
  return () => {
    port.postMessage({ closed: true });
    port.removeEventListener("message", receive);
    port.close();
  };
}

/** The `FrameServer` methods of an analysis worker. */
export function frameServer<F>(lookup: (snapshotId: string) => F) {
  const connections = new Map<string, () => void>();
  return {
    connectFrames: (id: string, port: MessagePort) => {
      connections.get(id)?.();
      connections.set(id, serveFrames(port, lookup));
    },
    disconnectFrames: (id: string) => {
      connections.get(id)?.();
      connections.delete(id);
    },
  };
}

/** Lives in the game worker; the UI never receives frame buffers. */
export class FrameReader<F> {
  private sequence = 0;
  private closed = false;
  private pending = new Map<
    number,
    {
      resolve: (frame: F) => void;
      reject: (error: unknown) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  constructor(private port: MessagePort) {
    port.addEventListener("message", this.receive);
    port.addEventListener("messageerror", this.failed);
    port.start();
  }
  read(snapshotId: string): Promise<F> {
    if (this.closed) return Promise.reject(Error("Campaign frame connection is closed"));
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(Error("Campaign frame request timed out"));
      }, 30_000);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.port.postMessage({ id, snapshotId } satisfies Request);
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      }
    });
  }
  private receive = (event: MessageEvent<Reply<F>>) => {
    const { id, frame, error, closed } = event.data;
    if (closed) {
      this.close();
      return;
    }
    const request = this.pending.get(id);
    if (!request) return;
    clearTimeout(request.timer);
    this.pending.delete(id);
    if (frame) request.resolve(frame);
    else request.reject(Error(error ?? "Invalid campaign frame response"));
  };
  private failed = () => this.close();
  close() {
    if (this.closed) return;
    this.closed = true;
    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
      request.reject(Error("Campaign frame connection closed"));
    }
    this.pending.clear();
    this.port.removeEventListener("message", this.receive);
    this.port.removeEventListener("messageerror", this.failed);
    this.port.close();
  }
}
