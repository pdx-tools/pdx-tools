import { Session, SessionRoute, withAuth } from "@/server-lib/auth/middleware";
import { DbRoute, saveView, table, toApiSave, withDb } from "@/server-lib/db";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { deleteFile, s3Keys } from "@/server-lib/s3";
import { z } from "zod";
import {
  AuthorizationError,
  NotFoundError,
  ValidationError,
} from "@/server-lib/errors";
import { withCore } from "@/server-lib/middleware";
import { log } from "@/server-lib/logging";

type SaveRouteParams = { params: { saveId: string } };

const getHandler = async (
  _req: NextRequest,
  { dbConn, params }: SaveRouteParams & DbRoute,
) => {
  const db = await dbConn;
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

  return NextResponse.json({ ...save.user, ...toApiSave(save.save) });
};

export const GET = withCore(withDb(getHandler));

export type SaveResponse =
  Awaited<ReturnType<typeof getHandler>> extends NextResponse<infer T>
    ? T
    : never;

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

function ensurePermissions(session: Session, db?: { userId: string }) {
  if (db === undefined) {
    throw new NotFoundError("save");
  }

  // Since JWTs are tamperproof we check them instead of querying
  // the DB if the user is an admin.
  if (db.userId !== session.uid && session.account !== "admin") {
    throw new AuthorizationError();
  }
}

async function patchHandler(
  req: NextRequest,
  { params, dbConn, session }: DbRoute & SessionRoute & SaveRouteParams,
) {
  const body = await req.json();
  const data = PatchBody.safeParse(body);
  if (!data.success) {
    throw new ValidationError("unable to parse patch props");
  }

  const db = await dbConn;
  await db.transaction(async (tx) => {
    const rows = await tx
      .update(table.saves)
      .set(data.data)
      .where(eq(table.saves.id, params.saveId))
      .returning({ userId: table.saves.userId });

    ensurePermissions(session, rows.at(0));
  });

  log.event({ userId: session.uid, event: "Save patched", key: params.saveId });
  return new Response(null, { status: 204 });
}

export const PATCH = withCore(withAuth(withDb(patchHandler)));

async function deleteHandler(
  _req: NextRequest,
  { params, dbConn, session }: SessionRoute & DbRoute & SaveRouteParams,
) {
  const db = await dbConn;
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
  log.event({ userId: session.uid, event: "Save deleted", key: params.saveId });
  return new Response(null, { status: 204 });
}

export const DELETE = withCore(withAuth(withDb(deleteHandler)));
