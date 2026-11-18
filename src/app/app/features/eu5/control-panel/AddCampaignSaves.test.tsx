import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import type * as HistoryStore from "../history/store";

const mocks = vi.hoisted(() => ({
  developer: false,
  actions: [] as Array<() => unknown>,
  publish: vi.fn(async () => {}),
  analyze: vi.fn(async () => {}),
}));
vi.mock("@/features/engine", () => ({
  useFilePublisher: (options: { openSave?: boolean }) => {
    expect(options).toEqual({ openSave: false });
    return mocks.publish;
  },
}));
vi.mock("../history/useIsCampaignAnalysisEnabled", () => ({
  useIsCampaignAnalysisEnabled: () => mocks.developer,
}));
vi.mock("../store", () => ({
  useEu5PlaythroughId: () => "campaign",
  useEu5Input: () => ({ kind: "server" }),
}));
vi.mock("@/features/campaign/localSaves", () => ({
  localSaveRegistry: {
    useEntries: () => [
      { id: "done", game: "eu5", identity: { playthroughId: "campaign" }, ...file("done") },
      { id: "new", game: "eu5", identity: { playthroughId: "campaign" }, ...file("new") },
    ],
  },
  registerLocalSaves: vi.fn(),
  holdsRef: () => false,
}));
const file = (name: string) => ({
  version: { size: 4, lastModified: 1 },
  ref: { kind: "file", file: new File(["save"], `${name}.eu5`, { lastModified: 1 }) },
});
vi.mock("../history/analyzeCampaign", () => ({ analyzeCampaign: mocks.analyze }));
vi.mock("@/components/game/Button", () => ({
  GameButton: ({ onClick, ...props }: ComponentProps<"button">) => {
    mocks.actions.push(() => onClick?.({} as never));
    return <button {...props} />;
  },
}));
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

import { AddCampaignSaves } from "./AddCampaignSaves";
import { useHistory } from "../history/store";

beforeEach(() => {
  mocks.developer = true;
  mocks.actions = [];
  mocks.analyze.mockClear();
  mocks.publish.mockClear();
  useHistory.setState({
    analysisEnabledCampaigns: [],
    analysisPausedCampaigns: [],
    progress: null,
    issues: [],
    snapshots: [],
    sources: {},
  });
});

it("hides save selection without campaign analysis access", () => {
  mocks.developer = false;
  expect(renderToStaticMarkup(<AddCampaignSaves />)).toBe("");
});

it("offers multiple-file and folder selection without activating analysis", () => {
  const html = renderToStaticMarkup(<AddCampaignSaves />);
  expect(html).toContain("Add saves");
  expect(html).toContain('accept=".eu5" multiple=""');
  expect(html).toContain('webkitdirectory=""');
  expect(useHistory.getState().analysisEnabledCampaigns).toEqual([]);
  expect(mocks.analyze).not.toHaveBeenCalled();
});

it("activates analysis only after the developer clicks Analyze campaign", () => {
  expect(renderToStaticMarkup(<AddCampaignSaves />)).toContain("Analyze campaign");
  expect(useHistory.getState().analysisEnabledCampaigns).toEqual([]);
  mocks.actions[2]();
  expect(useHistory.getState().analysisEnabledCampaigns).toEqual(["campaign"]);
  // CampaignAnalysis observes activation and starts the first import.
  expect(mocks.analyze).not.toHaveBeenCalled();
});

it("resumes a paused campaign through the existing importer", () => {
  useHistory.setState({
    analysisEnabledCampaigns: ["campaign"],
    analysisPausedCampaigns: ["campaign"],
  });
  expect(renderToStaticMarkup(<AddCampaignSaves />)).toContain("Resume import");
  mocks.actions[2]();
  expect(useHistory.getState().analysisPausedCampaigns).toEqual([]);
  expect(mocks.analyze).toHaveBeenCalledWith(expect.any(Array), "campaign");
});

it("retries only the saves that have no analysis", () => {
  useHistory.setState({
    analysisEnabledCampaigns: ["campaign"],
    issues: ["new.eu5: invalid save"],
    snapshots: [{ id: "snapshot", campaignId: "campaign" } as never],
    sources: { done: { snapshotId: "snapshot", version: { size: 4, lastModified: 1 } } },
  });
  expect(renderToStaticMarkup(<AddCampaignSaves />)).toContain("Retry import");
  mocks.actions[2]();
  expect(mocks.analyze).toHaveBeenCalledWith([expect.objectContaining({ id: "new" })], "campaign");
});

afterEach(() => vi.unstubAllGlobals());
it("passes native file handles to the shared publisher", async () => {
  const handle = { kind: "file", name: "save.eu5" };
  const picker = vi.fn(async () => [handle]);
  vi.stubGlobal("window", { showOpenFilePicker: picker });
  renderToStaticMarkup(<AddCampaignSaves />);
  await mocks.actions[0]();
  expect(picker).toHaveBeenCalledWith(expect.objectContaining({ multiple: true }));
  expect(mocks.publish).toHaveBeenCalledWith([{ kind: "handle", file: handle }]);
});
it("keeps handles from nested folders and ignores non-save files", async () => {
  const first = { kind: "file", name: "first.eu5" },
    second = { kind: "file", name: "second.EU5" };
  const nested = {
    kind: "directory",
    async *values() {
      yield second;
      yield { kind: "file", name: "notes.txt" };
    },
  };
  const directory = {
    async *values() {
      yield first;
      yield nested;
    },
  };
  vi.stubGlobal("window", { showDirectoryPicker: vi.fn(async () => directory) });
  renderToStaticMarkup(<AddCampaignSaves />);
  await mocks.actions[1]();
  expect(mocks.publish).toHaveBeenCalledWith([
    { kind: "handle", file: first },
    { kind: "handle", file: second },
  ]);
});
it("does not report a cancelled native picker as an import failure", async () => {
  vi.stubGlobal("window", {
    showOpenFilePicker: vi.fn(async () => {
      throw new DOMException("Cancelled", "AbortError");
    }),
  });
  renderToStaticMarkup(<AddCampaignSaves />);
  await mocks.actions[0]();
  expect(mocks.publish).not.toHaveBeenCalled();
  expect(useHistory.getState().issues).toEqual([]);
});
