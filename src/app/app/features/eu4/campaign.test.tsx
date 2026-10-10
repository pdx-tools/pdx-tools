import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readIdentity } from "@/features/eu4/reader/module";
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
  parseMeta: vi.fn(),
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
    module: { parse_meta: mocks.parseMeta },
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

const localEntry = (id: string, file: File, identity: LocalSaveEntry["identity"], batch = 1) =>
  ({
    id,
    game: "eu4",
    ref: { kind: "file", file },
    name: file.name,
    identity,
    version: null,
    problem: null,
    batch,
  }) satisfies LocalSaveEntry;

describe("EU4 local campaign identity", () => {
  it("reads the metadata only, so the exact playthrough id is unknown", async () => {
    const early = new File(["early save"], "early.eu4");
    mocks.parseMeta.mockReturnValue({ date: "1511.10.30", campaign_id: "early-session" });
    const identity = await readIdentity(early);
    expect(identity).toEqual({
      playthroughId: null,
      campaignIdHint: "early-session",
      date: { year: 1511, month: 10, day: 30 },
    });
    expect(mocks.parseMeta).toHaveBeenCalledWith(new Uint8Array(await early.arrayBuffer()));
  });

  it("shows files of the same drop across changing metadata campaign ids", async () => {
    const early = new File(["early save"], "early.eu4");
    mocks.parseMeta.mockReturnValue({ date: "1511.10.30", campaign_id: "early-session" });
    const identity = await readIdentity(early);
    renderToString(<Eu4CampaignProvider loadError={null}>{null}</Eu4CampaignProvider>);
    const open = mocks.provide.mock.calls[0][0] as OpenSave;
    expect(open.playthroughId).toBe("stable-playthrough");
    expect(open.campaignIdHint).toBe("late-session");

    const entries = [
      localEntry("early", early, identity),
      localEntry("late", mocks.file!, {
        playthroughId: open.playthroughId,
        campaignIdHint: open.campaignIdHint,
        date: open.date,
      }),
      // Of another drop, with nothing that ties it to the campaign.
      localEntry("unrelated", new File([], "other.eu4"), identity, 2),
    ];
    const saves = mergeCampaignSaves({ open, entries, uploads: [], openEntry: entries[1] });
    expect(saves.map((save) => [save.name, save.isOpen, save.membership])).toEqual([
      ["early.eu4", false, "unknown"],
      ["late.eu4", true, "same"],
    ]);
  });
});
