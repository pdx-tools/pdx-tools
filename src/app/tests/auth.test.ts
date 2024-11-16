import { hasPermission, userId } from "@/lib/auth";
import { pdxUser } from "@/server-lib/auth/session";
import { describe, expect, it } from "vitest";

describe("auth", () => {
  it("guest auth", () => {
    const user = pdxUser({ kind: "guest" });
    expect(hasPermission(user, "savefile:update")).toBe(false);
    expect(
      hasPermission(user, "savefile:update", { userId: userId("10") }),
    ).toBe(false);
    expect(hasPermission(user, "savefile:create")).toBe(false);
    expect(
      hasPermission(user, "savefile:delete", { userId: userId("10") }),
    ).toBe(false);
    expect(hasPermission(user, "savefile:delete")).toBe(false);
  });

  it("user auth", () => {
    const user = pdxUser({
      kind: "user",
      account: "free",
      userId: userId("2"),
      steamId: "3",
    });
    expect(hasPermission(user, "savefile:update")).toBe(false);
    expect(
      hasPermission(user, "savefile:update", { userId: userId("10") }),
    ).toBe(false);
    expect(
      hasPermission(user, "savefile:update", { userId: userId("2") }),
    ).toBe(true);
    expect(hasPermission(user, "savefile:create")).toBe(true);
    expect(
      hasPermission(user, "savefile:delete", { userId: userId("10") }),
    ).toBe(false);
    expect(
      hasPermission(user, "savefile:delete", { userId: userId("2") }),
    ).toBe(true);
    expect(hasPermission(user, "savefile:delete")).toBe(false);
  });

  it("admin auth", () => {
    const user = pdxUser({
      kind: "user",
      account: "admin",
      userId: userId("2"),
      steamId: "3",
    });
    expect(hasPermission(user, "savefile:update")).toBe(true);
    expect(
      hasPermission(user, "savefile:update", { userId: userId("10") }),
    ).toBe(true);
    expect(hasPermission(user, "savefile:create")).toBe(true);
    expect(
      hasPermission(user, "savefile:delete", { userId: userId("10") }),
    ).toBe(true);
    expect(hasPermission(user, "savefile:delete")).toBe(true);
  });
});
