/** Collect each transferable backing buffer once, preserving shared column identities. */
export function collectBuffers(value: unknown): ArrayBuffer[] {
  const buffers = new Set<ArrayBuffer>();
  const visit = (item: unknown) => {
    if (ArrayBuffer.isView(item)) {
      if (item.buffer instanceof ArrayBuffer) buffers.add(item.buffer);
    } else if (Array.isArray(item)) {
      for (const child of item) visit(child);
    } else if (item && typeof item === "object") {
      for (const child of Object.values(item)) visit(child);
    }
  };
  visit(value);
  return [...buffers];
}
