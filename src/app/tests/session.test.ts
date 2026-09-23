import {
  isSessionStale,
  knownFeatures,
  SESSION_REFRESH_MS,
  sessionPayload,
} from "@/server-lib/auth/payload";
import { hasFeature, pdxUser, userId } from "@/lib/auth";
import { describe, expect, it } from "vitest";

describe("session refresh", () => {
  const now = 1_000_000_000;
  const session = {
    kind: "user",
    ...sessionPayload({ userId: userId("2"), steamId: "3", account: "free", features: [] }, now),
  } as const;

  it("is fresh within the refresh interval", () => {
    expect(isSessionStale(session, now)).toBe(false);
    expect(isSessionStale(session, now + SESSION_REFRESH_MS)).toBe(false);
  });

  it("is stale after the refresh interval", () => {
    expect(isSessionStale(session, now + SESSION_REFRESH_MS + 1)).toBe(true);
  });

  it("treats cookies without an issue time as stale", () => {
    expect(isSessionStale({ ...session, issuedAt: 0 }, now)).toBe(true);
  });

  it("drops unknown feature names from the database", () => {
    expect(knownFeatures(["not-a-feature"])).toEqual([]);
    expect(sessionPayload({ ...session, features: ["not-a-feature"] }).features).toEqual([]);
  });

  it("gives admins every feature", () => {
    const admin = pdxUser({ ...session, account: "admin" });
    const user = pdxUser(session);
    const probe = "eu5-upload";
    expect(hasFeature(admin, probe)).toBe(true);
    expect(hasFeature(user, probe)).toBe(false);
    expect(hasFeature({ ...user, features: [probe] }, probe)).toBe(true);
  });
});
