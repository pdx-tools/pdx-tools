import { ensurePermissions } from "@/lib/auth";
import { getAuth } from "@/server-lib/auth/session";
import { table } from "@/server-lib/db";
import { withDb } from "@/server-lib/db/middleware";
import { ValidationError } from "@/server-lib/errors";
import { getSave } from "@/server-lib/fn/save";
import { captureEvent } from "@/server-lib/posthog";
import { withCore } from "@/server-lib/middleware";
import { pdxStorage } from "@/server-lib/storage";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Route } from "./+types/api.saves.$saveId";

const SaveParam = z.object({
  saveId: z.string(),
});

const PatchBody = z.object({
  aar: z
    .string()
    .nullish()
    .transform((x) => x ?? undefined),
  filename: z
    .string()
    .nullish()
    .transform((x) => x ?? undefined),
  leaderboard_qualified: z.boolean().optional(),
});

export const loader = withCore(
  withDb(async ({ params: rawParams }: Route.LoaderArgs, { db }) => {
    const params = SaveParam.parse(rawParams);
    return Response.json(await getSave(db, params));
  }),
);

export const action = withCore(
  withDb(async ({ request, params: rawParams, context }: Route.ActionArgs, { db }) => {
    const params = SaveParam.parse(rawParams);
    const session = await getAuth({ request, context });
    switch (request.method) {
      case "PATCH": {
        const body = await request.json();
        const data = PatchBody.safeParse(body);
        if (!data.success) {
          throw new ValidationError("unable to parse patch props");
        }

        const updates = {
          ...data.data,
          leaderboardQualified: data.data.leaderboard_qualified,
        };

        // Leaderboard changes should be restricted to very privileged users.
        const wantsLeaderboardChange = data.data.leaderboard_qualified !== undefined;

        if (wantsLeaderboardChange) {
          ensurePermissions(session, "savefile:leaderboard-qualification");
        }

        await db.transaction(async (tx) => {
          const rows = await tx
            .update(table.saves)
            .set(updates)
            .where(eq(table.saves.id, params.saveId))
            .returning({ userId: table.saves.userId });

          ensurePermissions(session, "savefile:update", rows.at(0));
        });

        const eventProps: Record<string, string> = { key: params.saveId };
        if (data.data.leaderboard_qualified !== undefined) {
          eventProps.leaderboard_qualified = String(data.data.leaderboard_qualified);
        }
        captureEvent({
          userId: session.id,
          event: "Save patched",
          ...eventProps,
        });
        return new Response(null, { status: 204 });
      }
      case "DELETE": {
        const storage = pdxStorage({ context });
        await db.transaction(async (tx) => {
          const saves = await tx
            .delete(table.saves)
            .where(eq(table.saves.id, params.saveId))
            .returning({ userId: table.saves.userId });
          ensurePermissions(session, "savefile:delete", saves.at(0));
          await Promise.all([
            storage.saves.delete(params.saveId),
            storage.previews.delete(params.saveId),
          ]);
        });
        captureEvent({
          userId: session.id,
          event: "Save deleted",
          key: params.saveId,
        });
        return new Response(null, { status: 204 });
      }
      default: {
        throw Response.json(
          { msg: "Method not allowed" },
          {
            status: 405,
          },
        );
      }
    }
  }),
);
