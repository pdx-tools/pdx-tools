import { cachedSnapshots } from "./cache";
import { importTimeline } from "./importSnapshots";
import { useHistory } from "./store";

/** Open the first available date and keep importing across the viewer transition. */
export async function importEu5Batch(
  selection: File[],
  controller: AbortController,
  onReady: (file: File) => Promise<void>,
) {
  const files = selection.filter((file) => /\.eu5$/i.test(file.name));
  if (!files.length) throw Error("No EU5 saves were found in the selected folder.");
  if (files.length > 1000) throw Error("Import at most 1000 saves at a time.");
  if (useHistory.getState().batchImportProgress) throw Error("An import is already running.");
  const { signal } = controller;
  const startedAt = performance.now();
  useHistory.setState({
    batchImportProgress: { completed: 0, total: files.length, startedAt },
    cancelBatchImport: () => controller.abort(),
    batchImportIssues: [],
  });
  const issues: string[] = [];
  let lastProgress = 0;
  let opening: Promise<void> | undefined;
  let openedFile: File | undefined;
  let openingError: unknown;
  try {
    try {
      useHistory.getState().add(await cachedSnapshots());
    } catch {
      issues.push(
        "Browser cache unavailable; imported saves will remain available for this session.",
      );
    }
    const result = await importTimeline(files, {
      signal,
      existing: useHistory.getState().snapshots,
      onProgress: (completed, total, fileName) => {
        const now = performance.now();
        if (completed === total || now - lastProgress > 150) {
          lastProgress = now;
          useHistory.setState({ batchImportProgress: { completed, total, startedAt, fileName } });
        }
      },
      onWarning: (warning) => issues.push(warning),
      onSnapshots: (snapshots, sources) => {
        useHistory.getState().add(snapshots, sources);
        if (opening || signal.aborted) return;
        const first = [...snapshots]
          .sort((a, b) => a.dateSort - b.dateSort || a.hash.localeCompare(b.hash))
          .find((snapshot) => useHistory.getState().files[snapshot.hash]);
        if (!first) return;
        const state = useHistory.getState();
        state.select(first.hash);
        state.rememberMode("political");
        state.rememberPanel(true);
        state.showPanel(true);
        state.setTimelineSource("snapshots");
        openedFile = state.files[first.hash];
        opening = Promise.resolve()
          .then(() => onReady(openedFile!))
          .catch((error) => {
            openingError = error;
            controller.abort();
          });
      },
    });
    issues.push(...result.errors.map((error) => `${error.fileName}: ${error.error}`));
    if (signal.aborted) throw new DOMException("Import stopped", "AbortError");
    await opening;
    if (openingError) throw openingError;
    if (!openedFile) throw Error(issues.join("\n") || "No EU5 saves could be imported.");
    return { file: openedFile, issues };
  } finally {
    await opening;
    useHistory.setState({
      batchImportProgress: null,
      cancelBatchImport: null,
      batchImportIssues: issues,
    });
  }
}
