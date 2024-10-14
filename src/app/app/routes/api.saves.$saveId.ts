import { getAuth, Session } from "@/server-lib/auth/session";
import { saveView, table, toApiSave } from "@/server-lib/db";
import { DbConnection } from "@/server-lib/db/connection";
import { withDb } from "@/server-lib/db/middleware";
import {
  AuthorizationError,
  NotFoundError,
  ValidationError,
} from "@/server-lib/errors";
import { log } from "@/server-lib/logging";
import { withCore } from "@/server-lib/middleware";
import { pdxS3 } from "@/server-lib/s3";
import {
  ActionFunctionArgs,
  json,
  LoaderFunctionArgs,
} from "@remix-run/cloudflare";
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
  withDb(async ({ params: rawParams }: LoaderFunctionArgs, { db }) => {
    const params = SaveParam.parse(rawParams);
    return json(await getSave(db, params));
  }),
);

export const action = withCore(
  withDb(
    async (
      { request, params: rawParams, context }: ActionFunctionArgs,
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

            ensurePermissions(session, rows.at(0));
          });

          log.event({
            userId: session.uid,
            event: "Save patched",
            key: params.saveId,
          });
          return new Response(null, { status: 204 });
        }
        case "DELETE": {
          const s3 = pdxS3({ context });
          await db.transaction(async (tx) => {
            const saves = await tx
              .delete(table.saves)
              .where(eq(table.saves.id, params.saveId))
              .returning({ userId: table.saves.userId });
            ensurePermissions(session, saves.at(0));
            await Promise.all([
              s3.deleteFile(s3.keys.save(params.saveId)),
              s3.deleteFile(s3.keys.preview(params.saveId)),
            ]);
          });
          log.event({
            userId: session.uid,
            event: "Save deleted",
            key: params.saveId,
          });
          return new Response(null, { status: 204 });
        }
        default: {
          throw json(
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
