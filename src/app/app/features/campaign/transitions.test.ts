import { afterEach, expect, expectTypeOf, it, vi } from "vitest";
import type { Eu5Carry } from "@/features/eu5/campaignCarry";
import { createCampaignTransitions, VIEW_RESTORE_TTL_MS } from "./transitions";
import type { CampaignCarry } from "./transitions";
import { toPlaythroughId } from "./types";

const campaign = toPlaythroughId("campaign")!;
const view: CampaignCarry = {
  game: "eu5",
  payload: {
    mapMode: "political",
    viewport: null,
    selection: null,
    insightPanel: { open: false, width: 640 },
  },
};
afterEach(() => vi.useRealTimers());

it("restores the view once after a completed step", () => {
  const transitions = createCampaignTransitions();
  const step = transitions.begin("next")!;
  step.preserveView(campaign, view);
  step.complete();
  const received = transitions.takeView("eu5", campaign);
  expectTypeOf(received).toEqualTypeOf<Eu5Carry | null>();
  expectTypeOf<CampaignCarry>()
    .extract<{ game: "eu5" }>()
    .toEqualTypeOf<{ game: "eu5"; payload: Eu5Carry }>();
  expect(received).toEqual(view.payload);
  expect(transitions.takeView("eu5", campaign)).toBeNull();
});

it.each(["game", "campaign", "expired", "cancelled", "failed"])(
  "starts fresh when the view is %s",
  (reason) => {
    vi.useFakeTimers();
    const transitions = createCampaignTransitions();
    const step = transitions.begin("next")!;
    step.preserveView(campaign, view);
    if (reason === "cancelled") step.cancel();
    if (reason === "failed") transitions.failed();
    if (reason === "expired") vi.advanceTimersByTime(VIEW_RESTORE_TTL_MS + 1);
    expect(
      transitions.takeView(
        reason === "game" ? "eu4" : "eu5",
        reason === "campaign" ? toPlaythroughId("other") : campaign,
      ),
    ).toBeNull();
    expect(transitions.takeView("eu5", campaign)).toBeNull();
  },
);

it("blocks a second step until the first completes or fails", () => {
  const transitions = createCampaignTransitions();
  const first = transitions.begin("first")!;
  expect(transitions.begin("second")).toBeNull();
  first.complete();
  expect(transitions.begin("second")).not.toBeNull();
  transitions.failed();
  expect(transitions.begin("third")).not.toBeNull();
});

it("keeps a newer step and its view when an older step ends", () => {
  const transitions = createCampaignTransitions();
  const first = transitions.begin("first")!;
  transitions.failed();
  const next = transitions.begin("next")!;
  next.preserveView(campaign, view);
  first.cancel();
  expect(transitions.begin("other")).toBeNull();
  expect(transitions.takeView("eu5", campaign)).toEqual(view.payload);
});
