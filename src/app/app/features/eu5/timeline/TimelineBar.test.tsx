import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import type { CampaignSave } from "@/features/campaign/types";
import type { SaveAnalysisStatus } from "@/features/campaign/saveAnalysisPresentation";
import type { MapHistoryValue } from "../history/MapHistory";
import type * as HistoryStore from "../history/store";

const mocks = vi.hoisted(() => ({
  mode: "political",
  pending: 0,
  history: null as MapHistoryValue | null,
  status: undefined as ((save: CampaignSave) => SaveAnalysisStatus) | undefined,
  entry: null as { ref: { kind: "file"; file: { size: number; lastModified: number } } } | null,
}));
vi.mock("@/features/campaign/CampaignProvider", () => ({
  useCampaign: () => ({ pending: mocks.pending }),
}));
vi.mock("../history/context", () => ({ useMapHistory: () => mocks.history }));
vi.mock("../history/store", async (original) => {
  const actual = await original<typeof HistoryStore>();
  return {
    ...actual,
    useHistory: Object.assign(
      (select: (state: ReturnType<typeof actual.useHistory.getState>) => unknown) =>
        select(actual.useHistory.getState()),
      actual.useHistory,
    ),
  };
});
vi.mock("@/features/campaign/localSaves", () => ({
  localSaveRegistry: { get: () => mocks.entry },
}));
vi.mock("@/features/campaign/SaveMarks", () => ({
  useTimelineCampaign: (_start: unknown, status: typeof mocks.status) => {
    mocks.status = status;
    return undefined;
  },
}));
vi.mock("../store", () => ({
  useEu5MapMode: () => mocks.mode,
  useSetEu5TimelineBarHeight: () => vi.fn(),
}));
vi.mock("./useTimelineController", () => ({
  useTimelineController: () => ({ timeline: { start: { year: 1337, month: 1, day: 1 } } }),
}));
vi.mock("@/features/timeline/controller", () => ({ useTimelineKeyboard: vi.fn() }));
vi.mock("@/features/timeline/TimelineTransport", () => ({
  TimelineTransport: () => <span>Transport</span>,
}));
vi.mock("@/features/timeline/TimelineReadout", () => ({ TimelineReadout: () => null }));
vi.mock("@/features/timeline/TimelineScrubber", () => ({ TimelineScrubber: () => null }));
vi.mock("./TimelapseExport", () => ({ TimelapseExport: () => <span>Timelapse export</span> }));
vi.mock("../useViewportInsets", () => ({ useViewportInsets: () => ({ left: 0, right: 0 }) }));

import { TimelineBar } from "./TimelineBar";
import { useHistory } from "../history/store";

beforeEach(() => {
  mocks.mode = "political";
  mocks.pending = 0;
  mocks.history = null;
  mocks.status = undefined;
  mocks.entry = { ref: { kind: "file", file: { size: 10, lastModified: 1 } } };
  useHistory.setState({ sources: {}, analyzingEntryIds: [], failedSources: {} });
});

it("preserves political playback and exports without analysis", () => {
  const html = renderToStaticMarkup(<TimelineBar />);
  expect(html).toContain("Transport");
  expect(html).toContain("Timelapse export");
  expect(html).not.toContain("Save analysis status");
  expect(mocks.status).toBeUndefined();
});

it("does not expose a saved-date controller before activation", () => {
  mocks.mode = "control";
  expect(renderToStaticMarkup(<TimelineBar />)).toBe("");
});

it("shows the timeline while analysis has no completed frames", () => {
  mocks.mode = "control";
  mocks.history = {
    enabled: true,
    readyIds: new Set(),
    controller: { timeline: { start: { year: 1337, month: 1, day: 1 } }, locked: true },
  } as unknown as MapHistoryValue;
  const html = renderToStaticMarkup(<TimelineBar />);
  expect(html).toContain("Saved-date playback speed");
  expect(html).toContain("Save analysis status");
  expect(html).not.toContain("Timelapse export");
});

it("marks only matching file versions with resident map frames as ready", () => {
  mocks.history = { enabled: true, readyIds: new Set(["hash"]) } as MapHistoryValue;
  const save = { source: { kind: "local", entryId: "entry" } } as CampaignSave;
  useHistory.setState({
    sources: { entry: { snapshotId: "hash", version: { size: 10, lastModified: 1 } } },
  });
  renderToStaticMarkup(<TimelineBar />);
  expect(mocks.status?.(save)).toBe("ready");
  mocks.entry!.ref.file.lastModified = 2;
  expect(mocks.status?.(save)).toBe("pending");
  useHistory.setState({ analyzingEntryIds: ["entry"] });
  renderToStaticMarkup(<TimelineBar />);
  expect(mocks.status?.(save)).toBe("analyzing");
  expect(
    mocks.status?.({
      ...save,
      source: { kind: "upload", saveId: "upload", uploaderId: null, userName: "" },
    }),
  ).toBe("pending");
});

it("shows a reading indicator while new timeline dates are withheld", () => {
  mocks.pending = 12;
  expect(renderToStaticMarkup(<TimelineBar />)).toContain("12 remaining");
});
it("uses red for a failed file until it succeeds or its version changes", () => {
  mocks.history = { enabled: true, readyIds: new Set() } as MapHistoryValue;
  const save = { source: { kind: "local", entryId: "entry" } } as CampaignSave;
  useHistory.setState({
    failedSources: { entry: { version: { size: 10, lastModified: 1 }, error: "parse error" } },
  });
  renderToStaticMarkup(<TimelineBar />);
  expect(mocks.status?.(save)).toBe("failed");
  mocks.entry!.ref.file.lastModified = 2;
  expect(mocks.status?.(save)).toBe("pending");
  mocks.entry!.ref.file.lastModified = 1;
  useHistory.setState({ analyzingEntryIds: ["entry"] });
  renderToStaticMarkup(<TimelineBar />);
  expect(mocks.status?.(save)).toBe("analyzing");
});
