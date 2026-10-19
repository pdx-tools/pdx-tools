import { expect, it } from "vitest";
import { ParserAdmission, parserBudget } from "./admission";

const MIB = 1024 ** 2;

it("grants slots in order while they fit, and always lets one parser run", async () => {
  const admission = new ParserAdmission(500 * MIB);
  admission.setResident("eu4", 300 * MIB);
  const first = await admission.acquire(400 * MIB);
  const order: string[] = [];
  const second = admission.acquire(150 * MIB).then((release) => (order.push("second"), release));
  const third = admission.acquire(10 * MIB).then((release) => (order.push("third"), release));
  await Promise.resolve();
  expect(order).toEqual([]);
  first();
  first();
  (await second)();
  (await third)();
  expect(order).toEqual(["second", "third"]);
  expect(admission.usage()).toEqual({ active: 0, reservedBytes: 0, residentBytes: 300 * MIB });
});

it("counts resident data of each session, and a release of resident data grants a slot", async () => {
  const admission = new ParserAdmission(500 * MIB);
  admission.setResident("eu4", 200 * MIB);
  admission.setResident("eu5", 200 * MIB);
  const first = await admission.acquire(50 * MIB);
  let granted = false;
  void admission.acquire(100 * MIB).then(() => (granted = true));
  await Promise.resolve();
  expect(granted).toBe(false);
  admission.setResident("eu5", 0);
  await Promise.resolve();
  expect(granted).toBe(true);
  first();
});

it("removes a cancelled request so that later requests can go", async () => {
  const admission = new ParserAdmission(100 * MIB);
  const first = await admission.acquire(50 * MIB);
  const controller = new AbortController();
  const large = admission.acquire(90 * MIB, controller.signal);
  const small = admission.acquire(40 * MIB);
  controller.abort();
  await expect(large).rejects.toBeDefined();
  (await small)();
  first();
  expect(admission.usage().active).toBe(0);
});

it("keeps a budget for the page", () => {
  expect(parserBudget(8)).toBeCloseTo(8 * 0.65 * 1024 ** 3 - 512 * MIB);
  expect(parserBudget(0.25)).toBe(0);
});
