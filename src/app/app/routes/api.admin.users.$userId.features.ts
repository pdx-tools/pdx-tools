import { ensurePermissions, FEATURE_LIST, userId } from "@/lib/auth";
import type { Feature } from "@/lib/auth";
import { getAuth } from "@/server-lib/auth/session";
import { knownFeatures } from "@/server-lib/auth/payload";
import { table } from "@/server-lib/db";
import { withDb } from "@/server-lib/db/middleware";
import { NotFoundError, ValidationError } from "@/server-lib/errors";
import { log } from "@/server-lib/logging";
import { withCore } from "@/server-lib/middleware";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Route } from "./+types/api.admin.users.$userId.features";

const Params = z.object({ userId: z.string() });

const FeatureChange = z.object({
  feature: z.enum(FEATURE_LIST, { error: "unknown feature" }),
  enabled: z.boolean(),
});
export type FeatureChangeInput = z.input<typeof FeatureChange>;

export type UserFeaturesResponse = { features: Feature[] };

// The features an admin has granted to a user. Only admins can read this:
// a grant is an account detail, not part of the public profile.
export const loader = withCore(
  withDb(async ({ request, params, context }: Route.LoaderArgs, { db }) => {
    const session = await getAuth({ request, context });
    ensurePermissions(session, "user:features");
    const { userId: uid } = Params.parse(params);
    const rows = await db
      .select({ features: table.users.features })
      .from(table.users)
      .where(eq(table.users.userId, userId(uid)));
    const user = rows.at(0);
    if (!user) throw new NotFoundError("user");
    return Response.json({ features: knownFeatures(user.features) } satisfies UserFeaturesResponse);
  }),
);

// Grant or revoke one feature. The change is idempotent, so a double click
// or a retried request lands in the same state. The user sees the change
// within the session refresh interval; no new login is necessary.
export const action = withCore(
  withDb(async ({ request, params, context }: Route.ActionArgs, { db }) => {
    if (request.method !== "PATCH") {
      throw Response.json({ msg: "Method not allowed" }, { status: 405 });
    }

    const session = await getAuth({ request, context });
    ensurePermissions(session, "user:features");
    const { userId: uid } = Params.parse(params);
    const parsed = FeatureChange.safeParse(await request.json());
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((x) => x.message).join(", "));
    }
    const { feature, enabled } = parsed.data;

    const features = await db.transaction(async (tx) => {
      const rows = await tx
        .select({ features: table.users.features })
        .from(table.users)
        .where(eq(table.users.userId, userId(uid)))
        .for("update");
      const user = rows.at(0);
      if (!user) throw new NotFoundError("user");

      const current = new Set(user.features);
      if (enabled) {
        current.add(feature);
      } else {
        current.delete(feature);
      }
      const next = [...current];
      await tx
        .update(table.users)
        .set({ features: next })
        .where(eq(table.users.userId, userId(uid)));
      return knownFeatures(next);
    });

    log.info({ msg: "changed user features", user: uid, by: session.id, feature, enabled });
    return Response.json({ features } satisfies UserFeaturesResponse);
  }),
);
