import { describe, expect, it } from "vitest";
import {
  AnalysisAdmission,
  IMPORT_BUSY_ERROR,
  parserMemoryLimit,
  residentMemoryLimit,
} from "./admission";

describe("import lease", () => {
  it("allows one import at a time", () => {
    const admission = new AnalysisAdmission({ residentBytes: 100, parserBytes: 100 });
    const lease = admission.acquireImport();
    expect(() => admission.acquireImport()).toThrow(
      expect.objectContaining({ name: IMPORT_BUSY_ERROR }),
    );
    lease.release();
    expect(lease.active()).toBe(false);
    // A second release does not end the next import.
    const next = admission.acquireImport();
    lease.release();
    expect(next.active()).toBe(true);
    next.release();
  });

  it("fits parsers next to the resident data of all sessions", () => {
    const admission = new AnalysisAdmission({ residentBytes: 100, parserBytes: 100 });
    const lease = admission.acquireImport();
    admission.setResident("eu5", 40);
    admission.setResident("eu4", 20);
    expect(lease.parsersFit(2, 20)).toBe(true);
    expect(lease.parsersFit(3, 20)).toBe(false);
  });
});

it("uses conservative limits without device memory", () => {
  const MiB = 1024 ** 2;
  expect(residentMemoryLimit()).toBe(1024 * MiB);
  expect(residentMemoryLimit(0.5)).toBe(256 * MiB);
  expect(residentMemoryLimit(8)).toBe(1536 * MiB);
  // Two EU5 parsers (about 850 MiB each) fit on a 4 GiB device, but not three.
  expect(parserMemoryLimit()).toBe(parserMemoryLimit(4));
  expect(Math.floor(parserMemoryLimit(4) / (850 * MiB))).toBe(2);
  expect(Number.isInteger(parserMemoryLimit(4))).toBe(true);
  expect(parserMemoryLimit(0.25)).toBe(0);
});
