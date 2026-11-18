import { expect, it, vi } from "vitest";
import type { AppEngine } from "./ui-engine";
import type { Eu5Carry } from "./campaignCarry";
import { applyEu5Carry } from "./campaignCarry";

const carry = (extra: Partial<Eu5Carry> = {}): Eu5Carry => ({
  mapMode: "population",
  viewport: null,
  insightPanel: { open: true, width: 640 },
  selection: null,
  ...extra,
});

it("restores the view in one worker call, then moves the camera", async () => {
  const trigger = { restoreCampaignView: vi.fn(), fitWorldRect: vi.fn() };
  const engine = { trigger } as unknown as AppEngine;

  await applyEu5Carry(engine, carry());
  expect(trigger.restoreCampaignView).toHaveBeenCalledOnce();
  expect(trigger.fitWorldRect).not.toHaveBeenCalled();

  const viewport = { x: 1, y: 2, width: 3, height: 4 };
  const view = carry({ viewport });
  await applyEu5Carry(engine, view);
  expect(trigger.restoreCampaignView).toHaveBeenLastCalledWith(view);
  expect(trigger.fitWorldRect).toHaveBeenCalledExactlyOnceWith(viewport);
  expect(trigger.restoreCampaignView.mock.invocationCallOrder[1]).toBeLessThan(
    trigger.fitWorldRect.mock.invocationCallOrder[0],
  );
});
