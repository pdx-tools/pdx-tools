// TypeScript does not have these Chromium types.
type FileSystemObserverRecord = {
  type: "appeared" | "disappeared" | "errored" | "modified" | "moved" | "unknown";
};

declare class FileSystemObserver {
  constructor(callback: (records: FileSystemObserverRecord[]) => void);
  observe(handle: FileSystemHandle, options?: { recursive?: boolean }): Promise<void>;
  disconnect(): void;
}
