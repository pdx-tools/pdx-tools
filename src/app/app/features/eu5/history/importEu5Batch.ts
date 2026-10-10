import { cachedSnapshots } from "./cache";
import { importTimeline } from "./importSnapshots";
import { useHistory } from "./store";
import type { Snapshot } from "./types";

/** Import a home-page selection before opening its earliest saved date. */
export async function importEu5Batch(
  selection: File[],
  signal: AbortSignal,
  onProgress: (completed: number, total: number, fileName: string) => void,
) {
  const files = selection.filter((file) => /\.eu5$/i.test(file.name));
  if (!files.length) throw Error("No EU5 saves were found in the selected folder.");
  if (files.length > 1000) throw Error("Import at most 1000 saves at a time.");
  const issues: string[] = [];
  try {
    useHistory.getState().add(await cachedSnapshots());
  } catch {
    issues.push(
      "Browser cache unavailable; imported saves will remain available for this session.",
    );
  }
  const imported: Snapshot[] = [];
  const result = await importTimeline(files, {
    signal,
    existing: useHistory.getState().snapshots,
    onProgress,
    onWarning: (warning) => issues.push(warning),
    onSnapshots: (snapshots, sources) => {
      useHistory.getState().add(snapshots, sources);
      imported.push(...snapshots);
    },
  });
  issues.push(...result.errors.map((error) => `${error.fileName}: ${error.error}`));
  if (signal.aborted) throw new DOMException("Import stopped", "AbortError");
  const first = imported.sort((a, b) => a.dateSort - b.dateSort || a.hash.localeCompare(b.hash))[0];
  if (!first) throw Error(issues.join("\n") || "No EU5 saves could be imported.");
  const state = useHistory.getState();
  state.select(first.hash);
  state.rememberMode("political");
  state.rememberPanel(true);
  state.showPanel(true);
  state.setTimelineSource("snapshots");
  return { file: state.files[first.hash], issues };
}
