import { expect, it, vi } from "vitest";
import { create } from "zustand";
import type { LocalSaveEntry } from "@/features/campaign/localSaves";
import { campaignAnalysisState } from "./analysisState";
import type { AnalysisHistory, CampaignAnalysisState } from "./analysisState";
import type { SnapshotDescriptor } from "./descriptor";
import type { AnalysisSink, ImportOptions } from "./importScheduler";

const mocks = vi.hoisted(() => ({ importBatch: vi.fn() }));
vi.mock("./importScheduler", () => ({
  importBatch: (_files: File[], _parser: unknown, sink: unknown, options: unknown) =>
    mocks.importBatch(options, sink),
}));
import {
  adoptWatchStart,
  classifyWrite,
  datedPoints,
  liveTip,
  sessionHead,
  watchedPath,
  watchedWriteImporter,
} from "./watchedWrite";
import type { DatedPoint } from "./watchedWrite";

// A watch run that wrote 1510, 1511 and 1512, after a dropped 1500 save.
const points = new Map<string, DatedPoint>([
  ["drop", { seq: 0, parent: null, session: null, dateSort: 15000101 }],
  ["a", { seq: 1, parent: null, session: "s", dateSort: 15100101 }],
  ["b", { seq: 2, parent: "a", session: "s", dateSort: 15110101 }],
  ["c", { seq: 3, parent: "b", session: "s", dateSort: 15120101 }],
]);
const write = (id: string, dateSort: number) =>
  classifyWrite({ id, dateSort }, points, sessionHead(points, "s"));

it("adds a later write after the last one", () => {
  expect(write("d", 15130101)).toEqual({ kind: "added", id: "d", parent: "c" });
});

it("replaces the last write on its date", () => {
  expect(write("d", 15120101)).toEqual({ kind: "replaced", id: "d", parent: "b", replaced: "c" });
});

it("branches an earlier write from the last point on or before it", () => {
  expect(write("d", 15110601)).toEqual({
    kind: "branched",
    id: "d",
    parent: "b",
    tip: "c",
    left: 1,
  });
  expect(write("d", 15050101)).toEqual({
    kind: "branched",
    id: "d",
    parent: null,
    tip: "c",
    left: 3,
  });
});

it("adds only a source key for a write that is a point already", () => {
  expect(write("b", 15110101)).toEqual({ kind: "duplicate", id: "b" });
});

it("follows the newest watched write back through its parents", () => {
  const branched = new Map(points).set("d", {
    seq: 4,
    parent: "a",
    session: "s",
    dateSort: 15100601,
  });
  expect(liveTip(branched)).toBe("d");
  expect(watchedPath(branched, "d")).toEqual(["d", "a"]);
  // A new run continues from the game's current point.
  expect(sessionHead(branched, "t")).toBe("d");
});

it("changes nothing when a write does not parse", async () => {
  const history = create<CampaignAnalysisState>()((set) => campaignAnalysisState(set));
  history.getState().add([{ id: "a", campaignId: "c", dateSort: 15100101 } as SnapshotDescriptor]);
  const before = history.getState().points;
  mocks.importBatch.mockImplementation(async (options: ImportOptions<SnapshotDescriptor>) => {
    options.onFileComplete({ status: "failed", file: new File([], "autosave.eu4"), error: "eof" });
    return { failures: [{ fileName: "autosave.eu4", error: "eof" }], memoryFull: null };
  });
  const { importWrite } = importer(history);
  const outcome = await importWrite(entry, new File([], "autosave.eu4"), "c", "s", false);
  expect(outcome).toEqual({ kind: "failed", error: "eof" });
  expect(history.getState().points).toBe(before);
});

const entry = { id: "local-1", name: "autosave.eu4" } as LocalSaveEntry;
const descriptor = (id: string, dateSort: number) =>
  ({ id, campaignId: "c", dateSort }) as SnapshotDescriptor;

function importer(history: AnalysisHistory) {
  const analysis = {
    claim: () => {},
    generation: () => 1,
    signal: () => new AbortController().signal,
    append: vi.fn(async (_generation: number, output: { descriptor: SnapshotDescriptor }) => ({
      descriptor: output.descriptor,
      duplicate: false,
    })),
    remove: vi.fn(async () => {}),
  };
  const importWrite = watchedWriteImporter({
    history,
    analysis,
    parser: { refuse: () => null, start: vi.fn(), parse: vi.fn(), peakBytes: () => 0 },
  });
  return { importWrite, analysis };
}

it("replaces the last write on its date, unless another save holds it", async () => {
  mocks.importBatch.mockImplementation(
    async (
      options: ImportOptions<SnapshotDescriptor>,
      sink: AnalysisSink<{ descriptor: SnapshotDescriptor }, SnapshotDescriptor>,
    ) => {
      const { descriptor: next } = await sink.append(
        1,
        { descriptor: descriptor("b", 15100101) },
        options.lease,
      );
      options.onFileComplete({
        status: "accepted",
        file: new File([], "autosave.eu4"),
        descriptor: next,
      });
      return { failures: [], memoryFull: null };
    },
  );
  // Held by nothing else, by an upload, or kept by this browser's store.
  for (const holder of ["none", "upload", "kept", "keptByThisRun"] as const) {
    const history = create<CampaignAnalysisState>()((set) => campaignAnalysisState(set));
    history.getState().add([descriptor("a", 15100101)], {}, holder === "upload" ? { u: "a" } : {});
    history.setState((x) => ({
      // A kept point of an earlier run stays; one of this run is replaced.
      points: {
        a: {
          ...x.points.a,
          session: holder === "kept" ? "r" : "s",
          ...(holder.startsWith("kept") && { kept: true }),
        },
      },
    }));
    const { importWrite, analysis } = importer(history);
    const outcome = await importWrite(entry, new File([], "autosave.eu4"), "c", "s", false);
    expect(outcome).toMatchObject({ kind: "replaced", replaced: "a" });
    const replaced = holder === "none" || holder === "keptByThisRun";
    expect(analysis.remove).toHaveBeenCalledTimes(replaced ? 1 : 0);
  }
  // The file as the player opened it replaces nothing.
  const history = create<CampaignAnalysisState>()((set) => campaignAnalysisState(set));
  history.getState().add([descriptor("a", 15100101)]);
  history.setState((x) => ({ points: { a: { ...x.points.a, session: "r" } } }));
  const { importWrite, analysis } = importer(history);
  await importWrite(entry, new File([], "autosave.eu4"), "c", "s", true);
  expect(analysis.remove).not.toHaveBeenCalled();
});

it("starts a watch run at the state that analysis read before it", () => {
  const history = create<CampaignAnalysisState>()((set) => campaignAnalysisState(set));
  history.getState().add([descriptor("a", 15100101)], {
    [entry.id]: { snapshotId: "a", version: { size: 1, lastModified: 1 } },
  });
  const adopted = adoptWatchStart(history.getState(), entry, "s");
  expect(adopted?.points.a).toMatchObject({ session: "s", parent: null });
  // A point of the run is not adopted again.
  expect(adoptWatchStart({ ...history.getState(), ...adopted! }, entry, "t")).toBeNull();
});

it("places an adopted start before a later run's states as a branch", () => {
  const history = create<CampaignAnalysisState>()((set) => campaignAnalysisState(set));
  // An earlier run wrote q1 and q2; the player then opened an older save, p.
  history.getState().add([descriptor("q1", 15100101), descriptor("q2", 15200101)]);
  history.setState((x) => ({
    points: {
      q1: { ...x.points.q1, session: "r" },
      q2: { ...x.points.q2, session: "r", parent: "q1" },
    },
  }));
  history.getState().add([descriptor("p", 15150101)], {
    [entry.id]: { snapshotId: "p", version: { size: 1, lastModified: 1 } },
  });
  const adopted = adoptWatchStart(history.getState(), entry, "s")!;
  expect(adopted.points.p).toMatchObject({ session: "s", parent: "q1" });
  expect(liveTip(datedPoints({ ...history.getState(), ...adopted }))).toBe("p");
});
