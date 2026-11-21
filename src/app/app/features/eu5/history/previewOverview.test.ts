import { beforeEach, expect, it, vi } from "vitest";
import { previewOverview } from "./previewOverview";

const mocks = vi.hoisted(() => ({ query: vi.fn(), generation: vi.fn(() => 3) }));
vi.mock("./analysisClient", () => ({ eu5Analysis: mocks }));
const shown = { campaignId: "campaign", id: "frame-a" };
const result = { id: shown.id, json: '{"countries":[]}' };

beforeEach(() => {
  mocks.query.mockReset();
});

it("requests the overview of the accepted frame only", async () => {
  mocks.query.mockResolvedValue({ generation: 3, outcome: { status: "ok", value: result } });
  await expect(previewOverview(shown, "development")).resolves.toEqual({ countries: [] });
  expect(mocks.query).toHaveBeenCalledWith({
    campaignId: shown.campaignId,
    identity: shown.id,
    sequence: 0,
    selection: { kind: "ids", ids: [shown.id] },
    query: { kind: "chartOverview", key: "development" },
  });
});

it.each([
  { generation: 2, outcome: { status: "ok", value: result } },
  { generation: 3, outcome: { status: "stale" } },
  { generation: 3, outcome: { status: "ok", value: { ...result, id: "frame-b" } } },
])("ignores a reply that cannot describe the accepted frame", async (reply) => {
  mocks.query.mockResolvedValue(reply);
  await expect(previewOverview(shown, "development")).rejects.toMatchObject({ name: "AbortError" });
});
