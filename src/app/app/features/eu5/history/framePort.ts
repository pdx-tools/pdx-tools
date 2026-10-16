import type { MapFrame } from "./analysisTypes";
import { analyticalBuffers } from "./transferBuffers";
type Reply = { id: number; frame?: MapFrame; error?: string; closed?: boolean };
/** Serve immutable resident columns using one transferable frame copy. */
export function serveMapFrames(port: MessagePort, lookup: (hash: string) => MapFrame) {
  const receive = (event: MessageEvent<{ id: number; hash: string }>) => {
    const { id, hash } = event.data;
    try {
      const frame = structuredClone(lookup(hash));
      port.postMessage({ id, frame }, analyticalBuffers(frame));
    } catch (error) {
      port.postMessage({ id, error: String(error) });
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
/** Lives in the game worker; the UI never receives frame buffers. */
export class MapFrameReader {
  private sequence = 0;
  private closed = false;
  private pending = new Map<
    number,
    {
      resolve: (frame: MapFrame) => void;
      reject: (error: unknown) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  constructor(private port: MessagePort) {
    port.addEventListener("message", this.receive);
    port.addEventListener("messageerror", this.failed);
    port.start();
  }
  read(hash: string): Promise<MapFrame> {
    if (this.closed) return Promise.reject(Error("Campaign frame connection is closed"));
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(Error("Campaign frame request timed out"));
      }, 30_000);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.port.postMessage({ id, hash });
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      }
    });
  }
  private receive = (event: MessageEvent<Reply>) => {
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
