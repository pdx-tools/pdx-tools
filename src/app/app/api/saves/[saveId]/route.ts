import { Session, SessionRoute, withAuth } from "@/server-lib/auth/middleware";
import { DbRoute, table, toApiSaveUser, withDb } from "@/server-lib/db";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { deleteFile } from "@/server-lib/s3";
import { z } from "zod";
import {
  AuthorizationError,
  NotFoundError,
  ValidationError,
} from "@/server-lib/errors";
import { withCore } from "@/server-lib/middleware";

type SaveRouteParams = { params: { saveId: string } };

export const GET = withCore(
  withDb(async (_req, { dbConn, params }: SaveRouteParams & DbRoute) => {
    const db = await dbConn;
    const saves = await db
      .select()
      .from(table.saves)
      .where(eq(table.saves.id, params.saveId))
      .innerJoin(table.users, eq(table.users.userId, table.saves.userId));

    const save = saves.at(0);
    if (save === undefined) {
      throw new NotFoundError("save");
    }

    return NextResponse.json(toApiSaveUser(save.saves, save.users));
  }),
);

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
    await deleteFile(params.saveId);
  });
  return new Response(null, { status: 204 });
}

export const DELETE = withCore(withAuth(withDb(deleteHandler)));
