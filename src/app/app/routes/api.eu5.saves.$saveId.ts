import { ensurePermissions } from "@/lib/auth";
import { getAuth } from "@/server-lib/auth/session";
import { table } from "@/server-lib/db";
import { withDb } from "@/server-lib/db/middleware";
import { getEu5Save } from "@/server-lib/fn/eu5-save";
import { withCore } from "@/server-lib/middleware";
import { pdxStorage } from "@/server-lib/storage";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Route } from "./+types/api.eu5.saves.$saveId";

const Params = z.object({ saveId: z.string() });

export const loader = withCore(
  withDb(async ({ params }: Route.LoaderArgs, { db }) =>
    Response.json(await getEu5Save(db, Params.parse(params))),
  ),
);

export const action = withCore(
  withDb(async ({ request, params, context }: Route.ActionArgs, { db }) => {
    if (request.method !== "DELETE") {
      throw Response.json({ msg: "Method not allowed" }, { status: 405 });
    }

    const { saveId } = Params.parse(params);
    const session = await getAuth({ request, context });
    const save = await db
      .select({ userId: table.eu5Saves.userId })
      .from(table.eu5Saves)
      .where(eq(table.eu5Saves.id, saveId));
    ensurePermissions(session, "savefile:delete", save.at(0));

    const storage = pdxStorage({ context, game: "eu5" });
    await db.transaction(async (tx) => {
      await tx.delete(table.eu5Saves).where(eq(table.eu5Saves.id, saveId));
      await Promise.all([storage.saves.delete(saveId), storage.previews.delete(saveId)]);
    });
    return new Response(null, { status: 204 });
  }),
);
