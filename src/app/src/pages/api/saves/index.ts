import { NextApiResponse } from "next";
import multer from "multer";
import fs, { createReadStream, createWriteStream } from "fs";
import { promisify } from "util";
import crypto from "crypto";
import os from "os";
import { pipeline } from "stream/promises";
import path from "path";
import { db } from "@/server-lib/db";
import { log } from "@/server-lib/logging";
import { fileChecksum, parseFile } from "@/server-lib/pool";
import { uploadFileToS3 } from "@/server-lib/s3";
import { ValidationError } from "@/server-lib/errors";
import { createBrotliDecompress, createGunzip } from "zlib";
import { NextSessionRequest, withSession } from "@/server-lib/session";
import { withCoreMiddleware } from "@/server-lib/middlware";
import { getOptionalString, getString } from "@/server-lib/valiation";
import { deduceUploadType, UploadType } from "@/server-lib/models";
import { nanoid } from "@reduxjs/toolkit";

const tmpDir = process.env["TMPDIR"] || os.tmpdir();
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
  const contentEncoding = getOptionalString(data, "content_encoding");

  return {
    aar,
    filename,
    uploadType: deduceUploadType(contentType, contentEncoding),
  };
};

// Get random, temporary file name. Same algorithm used by multer:
// https://github.com/expressjs/multer/blob/4f4326a6687635411a69d70f954f48abb4bce58a/storage/disk.js#L7-L11
const randomBytes = promisify(crypto.randomBytes);
const tmpPath = () =>
  randomBytes(16)
    .then((x) => x.toString("hex"))
    .then((x) => path.join(tmpDir, x));

const unwrapSave = async (fp: string, upload: UploadType): Promise<string> => {
  let inflater;
  switch (upload) {
    case "gzipText":
      inflater = createGunzip();
      break;
    case "brTar":
    case "brText":
      inflater = createBrotliDecompress();
      break;
    case "zip":
      return fp;
  }

  const destinationPath = await tmpPath();
  try {
    const source = createReadStream(fp);
    const destination = createWriteStream(destinationPath);
    await pipeline(source, inflater, destination);
    return destinationPath;
  } catch (ex) {
    log.exception(ex, { msg: "unable to inflate file" });
    attemptUnlink(destinationPath);
    throw new ValidationError("unable to inflate file");
  }
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
  const contentEncoding = req.headers["content-encoding"];

  // Detect if it is a raw file upload
  if (typeof filename !== "string" || typeof contentType !== "string") {
    return null;
  }

  const uploadType = deduceUploadType(contentType, contentEncoding ?? null);
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
  const [requestPath, metadata] = await handleUpload(req, res);
  let savePath: string | undefined;

  try {
    const saveId = nanoid();
    savePath = await unwrapSave(requestPath, metadata.uploadType);
    const checksum = await fileChecksum(savePath);

    const existingSaves = await db.save.count({
      where: {
        hash: checksum,
      },
    });

    if (existingSaves > 0) {
      throw new ValidationError("save already exists");
    }

    const out = await parseFile(savePath);
    if (out.kind === "InvalidPatch") {
      throw new ValidationError(`unsupported patch: ${out.patch_shorthand}`);
    }

    await uploadFileToS3(requestPath, saveId, metadata.uploadType);

    await db.save.create({
      data: {
        id: saveId,
        userId: uid,
        encoding: out.encoding,
        filename: metadata.filename,
        hash: checksum,
        date: out.date,
        days: out.days,
        score_days: out.score_days,
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
      },
    });

    const response: SavePostResponse = {
      save_id: saveId,
    };

    res.json(response);
  } finally {
    attemptUnlink(requestPath);
    if (savePath && savePath !== requestPath) {
      attemptUnlink(savePath);
    }
  }
};

export const config = {
  api: {
    bodyParser: false,
  },
};

export default withCoreMiddleware(withSession(handler));
