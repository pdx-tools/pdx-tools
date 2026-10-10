import { afterEach, expect, expectTypeOf, it } from "vitest";
import type { Eu5Carry } from "@/features/eu5/campaignCarry";
import { dropCampaignCarry, setCampaignCarry, takeCampaignCarry } from "./carry";
import type { CampaignCarry } from "./carry";
import { toPlaythroughId } from "./types";

afterEach(dropCampaignCarry);

it("returns the payload type of the requested game", () => {
  const campaign = toPlaythroughId("campaign");
  if (campaign === null) throw new Error("The playthrough id is empty");
  const payload: Eu5Carry = {
    mapMode: "political",
    viewport: null,
    selection: null,
    insightPanel: { open: false, width: 640 },
  };
  setCampaignCarry(campaign, { game: "eu5", payload });
  const received = takeCampaignCarry("eu5", campaign);
  expectTypeOf(received).toEqualTypeOf<Eu5Carry | null>();
  expectTypeOf<CampaignCarry>()
    .extract<{ game: "eu5" }>()
    .toEqualTypeOf<{ game: "eu5"; payload: Eu5Carry }>();
  expect(received).toBe(payload);
  expect(takeCampaignCarry("eu5", campaign)).toBeNull();
});
