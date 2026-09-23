import { z } from "zod";
import { check } from "@/lib/isPresent";
import { isFeature, SESSION_REFRESH_MS, userId } from "@/lib/auth";
import type { Feature, UserId } from "@/lib/auth";
import type { User } from "../db/schema";
import { log } from "../logging";

export const SessionPayloadSchema = z
  .object({
    userId: z.string().transform((x) => userId(x)),
    steamId: z.string(),
    account: z.enum(["free", "admin"]),
    // Cookies issued before these fields existed lack them. The defaults make
    // such cookies stale so that they are refreshed on the next request.
    features: z.array(z.string()).default([]).transform(knownFeatures),
    issuedAt: z.number().default(0),
  })
  .strict();

// The database stores feature names as text, so a typo in an UPDATE is not
// rejected. Drop names that are not defined and log them so the typo is
// noticed.
export function knownFeatures(features: string[]): Feature[] {
  const known: Feature[] = [];
  for (const feature of features) {
    if (isFeature(feature)) {
      known.push(feature);
    } else {
      log.warn({ msg: "unknown feature", feature });
    }
  }
  return known;
}

export type SessionPayload = {
  userId: UserId;
  steamId: string;
  account: User["account"];
  features: Feature[];
  issuedAt: number;
};

export type PdxSession = { kind: "guest" } | ({ kind: "user" } & SessionPayload);
export type PdxUserSession = Extract<PdxSession, { kind: "user" }>;

export const isSessionStale = (session: PdxUserSession, now = Date.now()) =>
  now - session.issuedAt > SESSION_REFRESH_MS;

export const sessionPayload = (
  user: Pick<User, "userId" | "steamId" | "account" | "features">,
  now = Date.now(),
): SessionPayload => ({
  userId: user.userId,
  steamId: check(user.steamId, "expected steam id"),
  account: user.account,
  features: knownFeatures(user.features),
  issuedAt: now,
});
