import { ensurePermissions } from "@/lib/auth";
import { getAuth } from "@/server-lib/auth/session";
import { saveView, table, toApiSave } from "@/server-lib/db";
import type { DbConnection } from "@/server-lib/db/connection";
import { withDb } from "@/server-lib/db/middleware";
import { NotFoundError, ValidationError } from "@/server-lib/errors";
import { log } from "@/server-lib/logging";
import { withCore } from "@/server-lib/middleware";
import { pdxCloudflareS3, pdxS3 } from "@/server-lib/s3";
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
});

export type SaveResponse = Awaited<ReturnType<typeof getSave>>;
async function getSave(db: DbConnection, params: { saveId: string }) {
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

  return { ...save.user, ...toApiSave(save.save) };
}

export const loader = withCore(
  withDb(async ({ params: rawParams }: Route.LoaderArgs, { db }) => {
    const params = SaveParam.parse(rawParams);
    return Response.json(await getSave(db, params));
  }),
);

export const action = withCore(
  withDb(
    async (
      { request, params: rawParams, context }: Route.ActionArgs,
      { db },
    ) => {
      const params = SaveParam.parse(rawParams);
      const session = await getAuth({ request, context });
      switch (request.method) {
        case "PATCH": {
          const body = await request.json();
          const data = PatchBody.safeParse(body);
          if (!data.success) {
            throw new ValidationError("unable to parse patch props");
          }

          await db.transaction(async (tx) => {
            const rows = await tx
              .update(table.saves)
              .set(data.data)
              .where(eq(table.saves.id, params.saveId))
              .returning({ userId: table.saves.userId });

            ensurePermissions(session, "savefile:update", rows.at(0));
          });

          log.event({
            userId: session.id,
            event: "Save patched",
            key: params.saveId,
          });
          return new Response(null, { status: 204 });
        }
        case "DELETE": {
          const s3 = pdxS3(pdxCloudflareS3({ context }));
          await db.transaction(async (tx) => {
            const saves = await tx
              .delete(table.saves)
              .where(eq(table.saves.id, params.saveId))
              .returning({ userId: table.saves.userId });
            ensurePermissions(session, "savefile:delete", saves.at(0));
            await Promise.all([
              s3.deleteFile(s3.keys.save(params.saveId)),
              s3.deleteFile(s3.keys.preview(params.saveId)),
            ]);
          });
          log.event({
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
    },
  ),
);
