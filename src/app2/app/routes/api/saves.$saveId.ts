import { Session, withAuth } from "@/server-lib/auth/middleware";
import { dbPool, saveView, table, toApiSave } from "@/server-lib/db";
import {
  AuthorizationError,
  NotFoundError,
  ValidationError,
} from "@/server-lib/errors";
import { log } from "@/server-lib/logging";
import { withCore } from "@/server-lib/middleware";
import { deleteFile, s3Keys } from "@/server-lib/s3";
import { json } from "@tanstack/start";
import { createAPIFileRoute } from "@tanstack/start/api";
import { eq } from "drizzle-orm";
import { z } from "zod";

function ensurePermissions(session: Session, db?: { userId: string }) {
  if (db === undefined) {
    throw new NotFoundError("save");
  }

  // Since sessions are tamperproof we check them instead of querying
  // the DB if the user is an admin.
  if (db.userId !== session.uid && session.account !== "admin") {
    throw new AuthorizationError();
  }
}

const PatchBody = z.object({
  aar: z
    .string()
    .nullish()
    .transform((x) => x ?? undefined),
  filename: z
    .string()
    .nullish()
    .transform((x) => x ?? undefined),
});

export const Route = createAPIFileRoute("/api/saves/$saveId")({
  GET: withCore(async ({ params }) => {
    const db = dbPool().orm;
    const saves = await db
      .select(
        saveView({
          save: { aar: table.saves.aar, filename: table.saves.filename },
        }),
      )
      .from(table.saves)
      .where(eq(table.saves.id, params.saveId))
      .innerJoin(table.users, eq(table.users.userId, table.saves.userId));

    const save = saves.at(0);
    if (save === undefined) {
      throw new NotFoundError("save");
    }

    return json({ ...save.user, ...toApiSave(save.save) });
  }),

  PATCH: withCore(
    withAuth(async ({ request, params }, { session }) => {
      const body = await request.json();
      const data = PatchBody.safeParse(body);
      if (!data.success) {
        throw new ValidationError("unable to parse patch props");
      }

      const db = dbPool().orm;
      await db.transaction(async (tx) => {
        const rows = await tx
          .update(table.saves)
          .set(data.data)
          .where(eq(table.saves.id, params.saveId))
          .returning({ userId: table.saves.userId });

        ensurePermissions(session, rows.at(0));
      });

      log.event({
        userId: session.uid,
        event: "Save patched",
        key: params.saveId,
      });
      return new Response(null, { status: 204 });
    }),
  ),

  DELETE: withCore(
    withAuth(async ({ params }, { session }) => {
      const db = dbPool().orm;
      await db.transaction(async (tx) => {
        const saves = await tx
          .delete(table.saves)
          .where(eq(table.saves.id, params.saveId))
          .returning({ userId: table.saves.userId });
        ensurePermissions(session, saves.at(0));
        await Promise.all([
          deleteFile(s3Keys.save(params.saveId)),
          deleteFile(s3Keys.preview(params.saveId)),
        ]);
      });
      log.event({
        userId: session.uid,
        event: "Save deleted",
        key: params.saveId,
      });
      return new Response(null, { status: 204 });
    }),
  ),
});
