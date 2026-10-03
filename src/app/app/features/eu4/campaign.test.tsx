import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readEu4Header } from "@/features/campaign/headerWorker/eu4";
import { mergeCampaignSaves } from "@/features/campaign/campaignSaves";
import type { OpenSave } from "@/features/campaign/types";
import type { LocalSaveEntry } from "@/features/campaign/localSaves";
import { Eu4CampaignProvider } from "./campaign";

const mocks = vi.hoisted(() => ({
  meta: {
    date: "1666-05-10",
    campaign_id: "late-session",
    playthroughId: "stable-playthrough",
    multiplayer: false,
  },
  file: null as File | null,
  parsePlaythrough: vi.fn(),
  initializeModule: vi.fn(),
  provide: vi.fn(),
}));

vi.mock("./store", () => ({
  useEu4Context: () => ({}),
  useEu4Meta: () => mocks.meta,
  useEu4SaveInput: () => ({ kind: "file", file: mocks.file }),
  useSaveFilename: () => "late.eu4",
  useServerSaveFile: () => null,
}));
vi.mock("@/features/eu4/worker/common", () => ({
  wasm: {
    initializeModule: mocks.initializeModule,
    module: { parse_playthrough: mocks.parsePlaythrough },
  },
}));
vi.mock("@/features/campaign/CampaignProvider", () => ({
  CampaignProvider: ({ open }: { open: OpenSave | null }) => {
    mocks.provide(open);
    return null;
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.file = new File(["late save"], "late.eu4");
  mocks.initializeModule.mockResolvedValue(undefined);
});

describe("EU4 local campaign identity", () => {
  it("groups saves across changing metadata campaign ids", async () => {
    const early = new File(["early save"], "early.eu4");
    mocks.parsePlaythrough.mockReturnValue({
      playthroughId: mocks.meta.playthroughId,
      date: { year: 1511, month: 10, day: 30 },
    });
    const header = await readEu4Header(early);
    renderToString(<Eu4CampaignProvider loadError={null}>{null}</Eu4CampaignProvider>);
    const open = mocks.provide.mock.calls[0][0] as OpenSave;
    expect(open.playthroughId).toBe("stable-playthrough");
    expect(header.playthroughId).toBe(open.playthroughId);
    expect(mocks.parsePlaythrough).toHaveBeenCalledWith(new Uint8Array(await early.arrayBuffer()));

    const entries: LocalSaveEntry[] = [
      {
        id: "early",
        game: "eu4",
        ref: { kind: "file", file: early },
        name: early.name,
        header,
        version: null,
        problem: null,
        batch: 1,
      },
      {
        id: "late",
        game: "eu4",
        ref: { kind: "file", file: mocks.file! },
        name: "late.eu4",
        header: { playthroughId: open.playthroughId, date: open.date },
        version: null,
        problem: null,
        batch: 1,
      },
      {
        id: "unrelated",
        game: "eu4",
        ref: { kind: "file", file: new File([], "other.eu4") },
        name: "other.eu4",
        header: { ...header, playthroughId: null },
        version: null,
        problem: null,
        batch: 1,
      },
    ];
    const saves = mergeCampaignSaves({ open, entries, uploads: [], openEntry: entries[1] });
    expect(saves.map((save) => [save.name, save.isOpen])).toEqual([
      ["early.eu4", false],
      ["late.eu4", true],
    ]);
  });
});
