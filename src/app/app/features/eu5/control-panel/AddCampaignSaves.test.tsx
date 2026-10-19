import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import type * as HistoryStore from "../history/store";

const mocks = vi.hoisted(() => ({
  developer: false,
  actions: [] as Array<() => void>,
  analyze: vi.fn(async () => {}),
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
    useEntries: () => [{ game: "eu5", identity: { playthroughId: "campaign" } }],
  },
  registerLocalSaves: vi.fn(),
  holdsRef: () => false,
}));
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
  mocks.developer = false;
  mocks.actions = [];
  mocks.analyze.mockClear();
  useHistory.setState({
    analysisEnabledCampaigns: [],
    analysisPaused: false,
    analysisPausedCampaigns: [],
    progress: null,
    issues: [],
  });
});

it("offers multiple-file and folder selection without activating analysis", () => {
  const html = renderToStaticMarkup(<AddCampaignSaves />);
  expect(html).toContain("Add saves");
  expect(html).toContain('accept=".eu5" multiple=""');
  expect(html).toContain('webkitdirectory=""');
  expect(html).not.toContain("Analyze campaign");
  expect(useHistory.getState().analysisEnabledCampaigns).toEqual([]);
  expect(mocks.analyze).not.toHaveBeenCalled();
});

it("activates analysis only after the developer clicks Analyze campaign", () => {
  mocks.developer = true;
  expect(renderToStaticMarkup(<AddCampaignSaves />)).toContain("Analyze campaign");
  expect(useHistory.getState().analysisEnabledCampaigns).toEqual([]);
  mocks.actions[2]();
  expect(useHistory.getState().analysisEnabledCampaigns).toEqual(["campaign"]);
  // CampaignAnalysis observes activation and starts the first import.
  expect(mocks.analyze).not.toHaveBeenCalled();
});

it("resumes a paused campaign through the existing importer", () => {
  mocks.developer = true;
  useHistory.setState({
    analysisEnabledCampaigns: ["campaign"],
    analysisPausedCampaigns: ["campaign"],
  });
  expect(renderToStaticMarkup(<AddCampaignSaves />)).toContain("Resume import");
  mocks.actions[2]();
  expect(useHistory.getState().analysisPausedCampaigns).toEqual([]);
  expect(mocks.analyze).toHaveBeenCalledWith(expect.any(Array), "campaign");
});
