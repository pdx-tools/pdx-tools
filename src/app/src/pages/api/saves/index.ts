import { NextApiResponse } from "next";
import multer from "multer";
import fs, { createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import path from "path";
import { log } from "@/server-lib/logging";
import { fileChecksum, parseFile } from "@/server-lib/pool";
import { uploadFileToS3 } from "@/server-lib/s3";
import { ValidationError } from "@/server-lib/errors";
import { NextSessionRequest, withSession } from "@/server-lib/session";
import { withCoreMiddleware } from "@/server-lib/middlware";
import { getString } from "@/server-lib/valiation";
import { deduceUploadType, UploadType } from "@/server-lib/models";
import { nanoid } from "nanoid";
import { tmpDir, tmpPath } from "@/server-lib/tmp";
import { NewSave, db, table } from "@/server-lib/db";
import { eq, sql } from "drizzle-orm";

const upload = multer({ dest: tmpDir });

interface UploadMetadata {
  aar: string;
  filename: string;
  uploadType: UploadType;
}

const parseMetadata = (data: any): UploadMetadata => {
  const aar = data?.aar ?? "";
  if (typeof aar !== "string" || aar.length > 5000) {
    throw new ValidationError(
      "expected aar to be a string of less than 5000 characters"
    );
  }

  let filename: string;
  try {
    filename = path.parse(data?.filename).base;
  } catch (e) {
    throw new ValidationError("unable to parse filename");
  }

  const contentType = getString(data, "content_type");

  return {
    aar,
    filename,
    uploadType: deduceUploadType(contentType),
  };
};

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

const uploadRawFile = async (
  req: NextSessionRequest
): Promise<[string, UploadMetadata] | null> => {
  const filename =
    req.headers["pdx-tools-filename"] ?? req.headers["rakaly-filename"];
  const contentType = req.headers["content-type"];

  // Detect if it is a raw file upload
  if (typeof filename !== "string" || typeof contentType !== "string") {
    return null;
  }

  const uploadType = deduceUploadType(contentType);
  const sinkPath = await tmpPath();
  try {
    const sink = createWriteStream(sinkPath);
    await pipeline(req, sink);

    return [
      sinkPath,
      {
        aar: "",
        filename,
        uploadType,
      },
    ];
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
    const rawUpload = await uploadRawFile(req);
    if (rawUpload) {
      return rawUpload;
    } else {
      throw new ValidationError("request file not found");
    }
  }

  try {
    const metadataObj = JSON.parse(req.body?.metadata || "{}");
    const metadata = parseMetadata(metadataObj);
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
    const checksum = await fileChecksum(savePath);

    const existingSaves = await db
      .select({ count: sql<number>`count(*)` })
      .from(table.saves)
      .where(eq(table.saves.hash, checksum));

    if (existingSaves[0].count > 0) {
      throw new ValidationError("save already exists");
    }

    const out = await parseFile(savePath);
    if (out.kind === "InvalidPatch") {
      throw new ValidationError(`unsupported patch: ${out.patch_shorthand}`);
    }

    await uploadFileToS3(savePath, saveId, metadata.uploadType);

    const newSave: NewSave = {
      id: saveId,
      userId: uid,
      encoding: out.encoding,
      filename: metadata.filename,
      hash: checksum,
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
      gameDifficulty: out.game_difficulty,
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
