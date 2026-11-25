/** Watching and copies need Chromium 133 or later on a computer. */
export function supportsKeptSaves(): boolean {
  return (
    typeof window !== "undefined" &&
    "showDirectoryPicker" in window &&
    "FileSystemObserver" in window &&
    "locks" in navigator &&
    "indexedDB" in window &&
    navigator.storage?.getDirectory !== undefined
  );
}
