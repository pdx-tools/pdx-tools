import { NextApiRequest, NextApiResponse } from "next";
import { ValidationError } from "@/server-lib/errors";
import { withCoreMiddleware } from "@/server-lib/middlware";
import { deleteFile } from "@/server-lib/s3";
import { NextSessionRequest, withSession } from "@/server-lib/session";
import { getString } from "@/server-lib/valiation";
import { Save, User, db, table, toApiSaveUser } from "@/server-lib/db";
import { eq } from "drizzle-orm";
import { z } from "zod";

interface SaveRequest {
  save: Save;
  user: User;
}

function withSave<R extends NextApiRequest, T extends R & SaveRequest>(
  handler: (req: T, res: NextApiResponse) => Promise<void> | void
) {
  return async (req: R, res: NextApiResponse) => {
    const saveId = getString(req.query, "saveId");
    const saves = await db
      .select()
      .from(table.saves)
      .where(eq(table.saves.id, saveId))
      .innerJoin(table.users, eq(table.users.userId, table.saves.userId));
    const save = saves[0];
    if (save === undefined) {
      res.status(404).json({ msg: "save does not exist" });
    } else {
      await handler({ ...req, save: save.saves, user: save.users } as T, res);
    }
  };
}

function withPrivilegedSave<T extends NextSessionRequest & SaveRequest>(
  handler: (req: T, res: NextApiResponse) => Promise<void> | void
) {
  return async (req: T, res: NextApiResponse) => {
    const uid = req.sessionUid;
    if (req.user.userId !== uid) {
      const users = await db
        .select()
        .from(table.users)
        .where(eq(table.users.userId, uid));
      if (users[0]?.account !== "admin") {
        res.status(403).json({ msg: "forbidden from performing action" });
        return;
      }
    }
    await handler(req, res);
  };
}

const _deleteHandler = async (
  req: NextSessionRequest & SaveRequest,
  res: NextApiResponse
) => {
  const save = req.save;
  await deleteFile(save.id);
  await db.delete(table.saves).where(eq(table.saves.id, save.id));
  res.status(200).send("");
};

const _getHandler = async (
  req: NextApiRequest & SaveRequest,
  res: NextApiResponse
) => {
  const result = toApiSaveUser(req.save, req.user);
  res.json(result);
};

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

const _patchHandler = async (
  req: NextSessionRequest & SaveRequest,
  res: NextApiResponse
) => {
  const data = PatchBody.safeParse(req.body);
  if (!data.success) {
    throw new ValidationError("unable to parse patch props");
  }

  await db
    .update(table.saves)
    .set(data.data)
    .where(eq(table.saves.id, req.save.id));
  res.status(200).send("");
};

const getHandler = withSave(_getHandler);
const patchHandler = withSession(withSave(withPrivilegedSave(_patchHandler)));
const deleteHandler = withSession(withSave(withPrivilegedSave(_deleteHandler)));

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method === "DELETE") {
    await deleteHandler(req, res);
  } else if (req.method === "GET") {
    await getHandler(req, res);
  } else if (req.method === "PATCH") {
    await patchHandler(req, res);
  } else {
    res.status(405).json({ msg: "method not allowed" });
  }
};

export default withCoreMiddleware(handler);
