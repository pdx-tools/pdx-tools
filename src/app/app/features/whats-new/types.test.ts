import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { updateReleaseFileSchema } from "./types";

const whatsNewDir = path.resolve(__dirname, "../../../public/whats-new");
const files = readdirSync(whatsNewDir).filter((name) => name.endsWith(".json"));

describe("what's new release files", () => {
  it("has release files", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)("%s matches the schema", (name) => {
    const raw: unknown = JSON.parse(readFileSync(path.join(whatsNewDir, name), "utf8"));
    expect(updateReleaseFileSchema.safeParse(raw).error).toBeUndefined();
  });
});
