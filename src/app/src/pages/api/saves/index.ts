import { NextApiResponse } from "next";
import multer from "multer";
import fs, { createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import { log } from "@/server-lib/logging";
import { uploadFileToS3 } from "@/server-lib/s3";
import { ValidationError } from "@/server-lib/errors";
import { NextSessionRequest, withSession } from "@/server-lib/session";
import { withCoreMiddleware } from "@/server-lib/middlware";
import { deduceUploadType } from "@/server-lib/models";
import { nanoid } from "nanoid";
import { tmpDir, tmpPath } from "@/server-lib/tmp";
import { NewSave, db, table, toDbDifficulty } from "@/server-lib/db";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { parseSave } from "@/server-lib/save-parser";

const upload = multer({ dest: tmpDir });

// https://github.com/sindresorhus/filename-reserved-regex/blob/main/index.js
const filename = () =>
  z
    .string()
    .max(255)
    .refine((path) => !/[<>:"/\\|?*\u0000-\u001F]/g.test(path), {
      message: "invalid file path characters",
    });

const contentType = () =>
  z.string().transform((val, ctx) => {
    const deduced = deduceUploadType(val);
    if (deduced === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Unrecognized upload type",
      });

      return z.NEVER;
    } else {
      return deduced;
    }
  });

const uploadMetadata = z
  .object({
    aar: z
      .string()
      .max(5000)
      .nullish()
      .transform((x) => x ?? ""),
    filename: filename(),
    content_type: contentType(),
  })
  .transform(({ content_type, ...rest }) => ({
    ...rest,
    uploadType: content_type,
  }));

export type UploadMetadaInput = z.input<typeof uploadMetadata>;
export type UploadMetadata = z.infer<typeof uploadMetadata>;
export interface SavePostResponse {
  save_id: string;
}

const fileuploader = upload.single("file");

const uploadFile = (
  req: NextSessionRequest,
  res: NextApiResponse
): Promise<Express.Multer.File | undefined> => {
  return new Promise((resolve, reject) => {
    const r = req as any;
    fileuploader(r, res as any, (result) => {
      if (result instanceof Error) {
        reject(result);
      }

      resolve(r.file);
    });
  });
};

const attemptUnlink = async (filepath: string) => {
  try {
    await fs.promises.unlink(filepath);
  } catch (innerEx) {
    log.exception(innerEx, { msg: "unable to clean up temporary file" });
  }
};

const headerMetadata = z
  .object({
    "pdx-tools-filename": filename().optional(),
    "rakaly-filename": filename().optional(),
    "content-type": contentType(),
  })
  .transform((val, ctx) => {
    const filename = val["pdx-tools-filename"] ?? val["rakaly-filename"];
    if (!filename) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "must provide filename",
      });

      return z.NEVER;
    }

    return {
      aar: "",
      filename,
      uploadType: val["content-type"],
    };
  });

const uploadRawFile = async (
  req: NextSessionRequest
): Promise<[string, UploadMetadata]> => {
  const headers = headerMetadata.parse(req.headers);
  const sinkPath = await tmpPath();
  try {
    const sink = createWriteStream(sinkPath);
    await pipeline(req, sink);
    return [sinkPath, headers];
  } catch (ex) {
    attemptUnlink(sinkPath);
    throw ex;
  }
};

const handleUpload = async (
  req: NextSessionRequest,
  res: NextApiResponse
): Promise<[string, UploadMetadata]> => {
  const requestFile = await uploadFile(req, res);

  if (!requestFile) {
    return await uploadRawFile(req);
  }

  try {
    const metadataObj = JSON.parse(req.body?.metadata || "{}");
    const metadata = uploadMetadata.parse(metadataObj);
    return [requestFile.path, metadata];
  } catch (ex) {
    attemptUnlink(requestFile.path);
    throw ex;
  }
};

const handler = async (req: NextSessionRequest, res: NextApiResponse) => {
  const uid = req.sessionUid;
  const [savePath, metadata] = await handleUpload(req, res);

  try {
    const saveId = nanoid();
    const data = await fs.promises.readFile(savePath);
    const out = await parseSave(data);

    if (out.kind === "InvalidPatch") {
      throw new ValidationError(`unsupported patch: ${out.patch_shorthand}`);
    }

    const existingSaves = await db
      .select({ count: sql<number>`count(*)` })
      .from(table.saves)
      .where(eq(table.saves.hash, out.hash));

    if (existingSaves[0].count > 0) {
      throw new ValidationError("save already exists");
    }

    await uploadFileToS3(savePath, saveId, metadata.uploadType);

    const newSave: NewSave = {
      id: saveId,
      userId: uid,
      encoding: out.encoding,
      filename: metadata.filename,
      hash: out.hash,
      date: out.date,
      days: out.days,
      scoreDays: out.score_days,
      player: out.player_tag,
      displayedCountryName: out.player_tag_name,
      campaignId: out.campaign_id,
      campaignLength: out.campaign_length,
      ironman: out.is_ironman,
      multiplayer: out.is_multiplayer,
      observer: out.is_observer,
      dlc: out.dlc_ids,
      saveVersionFirst: out.patch.first,
      saveVersionSecond: out.patch.second,
      saveVersionThird: out.patch.third,
      saveVersionFourth: out.patch.fourth,
      checksum: out.checksum,
      achieveIds: out.achievements || [],
      players: out.player_names,
      playerStartTag: out.player_start_tag,
      playerStartTagName: out.player_start_tag_name,
      gameDifficulty: toDbDifficulty(out.game_difficulty),
      aar: metadata.aar,
      playthroughId: out.playthrough_id,
    };

    await db.insert(table.saves).values(newSave);

    const response: SavePostResponse = {
      save_id: saveId,
    };

    res.json(response);
  } finally {
    attemptUnlink(savePath);
  }
};

export const config = {
  api: {
    bodyParser: false,
  },
};

export default withCoreMiddleware(withSession(handler));
