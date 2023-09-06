import { SessionRoute, withAuth } from "@/server-lib/auth/middleware";
import {
  DbRoute,
  Save,
  User,
  table,
  toApiSaveUser,
  withDb,
} from "@/server-lib/db";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { deleteFile } from "@/server-lib/s3";
import { z } from "zod";
import { ValidationError } from "@/server-lib/errors";

type SaveRouteParams = { params: { saveId: string } };
type SaveRoute = { save: { save: Save; user: User } } & SaveRouteParams;

function withSave<T = unknown, R = {}>(
  fn: (
    req: NextRequest,
    context: R & SaveRoute & DbRoute,
  ) => Promise<NextResponse<T> | Response>,
) {
  return async (
    req: NextRequest,
    ctxt: R & SaveRouteParams & DbRoute,
  ): Promise<NextResponse<T> | Response> => {
    const db = await ctxt.dbConn;
    const saves = await db
      .select()
      .from(table.saves)
      .where(eq(table.saves.id, ctxt.params.saveId))
      .innerJoin(table.users, eq(table.users.userId, table.saves.userId));
    const save = saves[0];
    if (save === undefined) {
      return NextResponse.json({ msg: "save does not exist" }, { status: 404 });
    } else {
      return fn(req, { ...ctxt, save: { save: save.saves, user: save.users } });
    }
  };
}

function withPrivilegedSave<T = unknown, R = {}>(
  fn: (
    req: NextRequest,
    context: R & SessionRoute & SaveRoute & DbRoute,
  ) => Promise<NextResponse<T> | Response>,
) {
  return async (
    req: NextRequest,
    ctxt: R & SessionRoute & SaveRoute & DbRoute,
  ): Promise<NextResponse<T> | Response> => {
    if (ctxt.save.user.userId !== ctxt.session.uid) {
      const db = await ctxt.dbConn;
      const users = await db
        .select()
        .from(table.users)
        .where(eq(table.users.userId, ctxt.session.uid));
      if (users[0]?.account !== "admin") {
        return NextResponse.json(
          { msg: "forbidden from performing action" },
          { status: 403 },
        );
      }
    }

    return fn(req, ctxt);
  };
}

export const GET = withDb(
  withSave(async (_req, { save }) => {
    return NextResponse.json(toApiSaveUser(save.save, save.user));
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

async function patchHandler(
  req: NextRequest,
  { save, dbConn }: SaveRoute & DbRoute,
) {
  const body = await req.json();
  const data = PatchBody.safeParse(body);
  if (!data.success) {
    throw new ValidationError("unable to parse patch props");
  }

  const db = await dbConn;
  await db
    .update(table.saves)
    .set(data.data)
    .where(eq(table.saves.id, save.save.id));
  return new Response(null, { status: 204 });
}

export const PATCH = withAuth(
  withDb(withSave(withPrivilegedSave(patchHandler))),
);

async function deleteHandler(
  _req: NextRequest,
  { save, dbConn }: SaveRoute & DbRoute,
) {
  const db = await dbConn;
  await deleteFile(save.save.id);
  await db.delete(table.saves).where(eq(table.saves.id, save.save.id));
  return new Response(null, { status: 204 });
}

export const DELETE = withAuth(
  withDb(withSave(withPrivilegedSave(deleteHandler))),
);
