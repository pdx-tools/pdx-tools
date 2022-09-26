import { Save, User, Prisma } from "@prisma/client";
import { NextApiRequest, NextApiResponse } from "next";
import { db, toApiSave } from "@/server-lib/db";
import { ValidationError } from "@/server-lib/errors";
import { withCoreMiddleware } from "@/server-lib/middlware";
import { deleteFile } from "@/server-lib/s3";
import { NextSessionRequest, withSession } from "@/server-lib/session";
import { getOptionalString, getString } from "@/server-lib/valiation";

interface SaveRequest {
  save: Save & { user: User };
}

function withSave<R extends NextApiRequest, T extends R & SaveRequest>(
  handler: (req: T, res: NextApiResponse) => Promise<void> | void
) {
  return async (req: R, res: NextApiResponse) => {
    const saveId = getString(req.query, "saveId");
    const save = await db.save.findUnique({
      where: { id: saveId },
      include: { user: true },
    });
    if (save === null) {
      res.status(404).json({ msg: "save does not exist" });
    } else {
      await handler({ ...req, save } as T, res);
    }
  };
}

function withPrivilegedSave<T extends NextSessionRequest & SaveRequest>(
  handler: (req: T, res: NextApiResponse) => Promise<void> | void
) {
  return async (req: T, res: NextApiResponse) => {
    const uid = req.sessionUid;
    if (req.save.userId !== uid) {
      const user = await db.user.findUnique({ where: { userId: uid } });
      if (user === null || user.account !== "ADMIN") {
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
  await db.save.delete({ where: { id: save.id } });
  res.status(200).send("");
};

const _getHandler = async (
  req: NextApiRequest & SaveRequest,
  res: NextApiResponse
) => {
  const result = toApiSave(req.save);
  res.json(result);
};

const _patchHandler = async (
  req: NextSessionRequest & SaveRequest,
  res: NextApiResponse
) => {
  let data: Prisma.SaveUpdateInput = {};
  try {
    const aar = getOptionalString(req.body, "aar");
    if (aar != null) {
      data.aar = aar;
    }

    const filename = getOptionalString(req.body, "filename");
    if (filename != null) {
      data.filename = filename;
    }
  } catch (ex) {
    throw new ValidationError("unable to parse patch props");
  }

  await db.save.update({
    where: {
      id: req.save.id,
    },
    data,
  });
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
