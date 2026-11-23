import { expect, it } from "vitest";
import { analysisBands, pauseNote } from "./analysisBand";
import type { BandInput } from "./analysisBand";

const save = (status: BandInput["saves"][number]["status"], retry = false) => ({ status, retry });
const base: BandInput = {
  saves: [save("ready"), save("analyzing"), save("pending")],
  identifying: 0,
  reading: null,
  pause: null,
  waitingUploads: 0,
};
const kinds = (input: Partial<BandInput>) =>
  analysisBands({ ...base, ...input }).map((x) => x.kind);

it("counts from each save's status, as the axis does", () => {
  expect(analysisBands({ ...base, reading: { downloading: false } })[0].text).toBe(
    "Reading 1 of 3 saves",
  );
  expect(
    analysisBands({
      ...base,
      saves: [save("pending"), save("ready")],
      identifying: 1,
      pause: "stopped",
    })[0].text,
  ).toBe("Stopped: 1 of 3 saves read.");
});

it("shows no band before a chart, where the next step has the one action", () => {
  expect(kinds({ saves: [save("pending")], waitingUploads: 1 })).toEqual([]);
  expect(kinds({ saves: [save("pending")], pause: "stopped" })).toEqual([]);
  // A save still being identified does not make a chart.
  expect(kinds({ saves: [save("pending")], identifying: 1, waitingUploads: 1 })).toEqual([]);
});

it("keeps one band per kind in a fixed order, and the full one only when memory is full", () => {
  expect(kinds({ reading: { downloading: false }, waitingUploads: 2 })).toEqual(["reading"]);
  expect(kinds({ waitingUploads: 2 })).toEqual(["uploads"]);
  expect(kinds({ pause: "stopped", waitingUploads: 2 })).toEqual(["stopped"]);
  expect(kinds({ pause: "failed", saves: [...base.saves, save("failed", true)] })).toEqual([
    "stopped",
    "lost",
  ]);
  expect(kinds({ pause: "full" })).toEqual(["full"]);
});

it("gives a paused campaign before a chart its reason, and Resume unless memory is full", () => {
  expect(pauseNote(null, [])).toBeNull();
  expect(pauseNote("stopped", [])).toEqual({ text: "Reading stopped.", resume: true });
  expect(pauseNote("failed", ["Campaign analysis stopped unexpectedly."])).toEqual({
    text: "Campaign analysis stopped unexpectedly.",
    resume: true,
  });
  expect(pauseNote("full", [])?.resume).toBe(false);
});
