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
import { remainingSaveSlots } from "@/server-lib/redis";
import { NextSessionRequest, withSession } from "@/server-lib/session";
import { withCoreMiddleware } from "@/server-lib/middlware";
import {
  addToLeaderboard,
  leaderboardEligible,
} from "@/server-lib/leaderboard";
import { getOptionalString, getString } from "@/server-lib/valiation";
import { uploadType, UploadType } from "@/server-lib/models";
import { nanoid } from "@reduxjs/toolkit";

const tmpDir = process.env["TMPDIR"] || os.tmpdir();
var upload = multer({
  dest: tmpDir,
  limits: {
    fileSize: 20 * 1024 * 1024,
  },
});

const parseMetadata = (data: any) => {
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
    uploadType: uploadType(contentType, contentEncoding),
  };
};

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

  try {
    const destinationPath = await tmpPath();
    const source = createReadStream(fp);
    const destination = createWriteStream(destinationPath);
    await pipeline(source, inflater, destination);
    return destinationPath;
  } catch (ex) {
    log.exception(ex, { msg: "unable to inflate file" });
    throw new ValidationError("unable to unzip file");
  }
};

export interface SavePostResponse {
  save_id: string;
  remaining_save_slots: number;
  used_save_slot: boolean;
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

const handler = async (req: NextSessionRequest, res: NextApiResponse) => {
  const uid = req.sessionUid;
  const requestFile = await uploadFile(req, res);

  if (!requestFile) {
    throw new ValidationError("request file not found");
  }

  const requestPath = requestFile.path;
  let savePath: string | undefined;

  try {
    const metadataObj = JSON.parse(req.body?.metadata || "{}");
    const metadata = parseMetadata(metadataObj);
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

    const remainingSlots = await remainingSaveSlots(uid);
    let needsSlot = false;

    needsSlot = (out.achievements || []).length === 0;
    if (needsSlot && remainingSlots <= 0) {
      throw new ValidationError(
        "not eligible for achievements and no remaining save slots"
      );
    }

    const qualifyingRecord = await leaderboardEligible({
      days: out.days,
      achievements: out.achievements || [],
      campaignId: out.campaign_id,
      playthroughId: out.playthrough_id,
    });

    needsSlot = needsSlot || !qualifyingRecord;
    if (needsSlot && remainingSlots <= 0) {
      throw new ValidationError(
        "same playthoughs need to have time improved upon or have more achievements and no more save slots"
      );
    }

    await uploadFileToS3(
      requestPath,
      saveId,
      requestFile.size,
      metadata.uploadType
    );

    const newRow = await db.save.create({
      data: {
        id: saveId,
        userId: uid,
        encoding: out.encoding,
        filename: metadata.filename,
        hash: checksum,
        date: out.date,
        days: out.days,
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
        saveSlot: needsSlot,
      },
    });

    await addToLeaderboard(saveId, out, +newRow.createdOn / 1000);

    const response: SavePostResponse = {
      save_id: saveId,
      remaining_save_slots: remainingSlots,
      used_save_slot: needsSlot,
    };

    res.json(response);
  } finally {
    await fs.promises.unlink(requestPath);
    if (savePath && savePath !== requestPath) {
      await fs.promises.unlink(savePath);
    }
  }
};

export const config = {
  api: {
    bodyParser: false,
  },
};

export default withCoreMiddleware(withSession(handler));
