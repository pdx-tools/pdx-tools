import { ensurePermissions } from "@/lib/auth";
import { timeit } from "@/lib/timeit";
import { getSessionUser } from "@/server-lib/auth/user";
import { NewSave, table, toDbDifficulty } from "@/server-lib/db";
import { usingDb } from "@/server-lib/db/connection";
import { ValidationError } from "@/server-lib/errors";
import { pdxFns } from "@/server-lib/functions";
import { genId } from "@/server-lib/id";
import { log } from "@/server-lib/logging";
import { withCore } from "@/server-lib/middleware";
import {
  SavePostResponse,
} from "@/server-lib/models";
import { pdxOg } from "@/server-lib/og";
import { pdxCloudflareS3, pdxS3 } from "@/server-lib/s3";
import { fileUploadData } from "@/server-lib/uploads";
import { ActionFunctionArgs } from "@remix-run/cloudflare";

export const action = withCore(
  async ({ request, context }: ActionFunctionArgs) => {
    if (request.method !== "POST") {
      throw Response.json({ msg: "Method not allowed" }, { status: 405 });
    }

    const session = await getSessionUser({ request, context });
    ensurePermissions(session, "savefile:create");
    const { bytes, metadata } = await fileUploadData(request);
    const saveId = genId(12);
    const s3 = pdxS3(pdxCloudflareS3({ context }));
    const s3Key = s3.keys.save(saveId);

    // Optimistically start upload to s3, the longest stage
    const uploadTask = s3.uploadFileToS3(bytes, s3Key, metadata.uploadType);

    try {
      const { data: out, elapsedMs } = await timeit(() =>
        pdxFns({
          endpoint: context.cloudflare.env.PARSE_API_ENDPOINT,
        }).parseSave(bytes),
      );
      log.info({
        key: saveId,
        user: session.id,
        msg: "parsed file",
        elapsedMs: elapsedMs.toFixed(2),
      });

      if (out.kind === "InvalidPatch") {
        throw new ValidationError(`unsupported patch: ${out.patch_shorthand}`);
      }

      const newSave: NewSave = {
        id: saveId,
        userId: session.id,
        filename: metadata.filename,
        hash: out.hash,
        date: out.date,
        days: out.days,
        scoreDays: out.score_days,
        playerTag: out.player_tag,
        playerTagName: out.player_tag_name,
        saveVersionFirst: out.patch.first,
        saveVersionSecond: out.patch.second,
        saveVersionThird: out.patch.third,
        saveVersionFourth: out.patch.fourth,
        achieveIds: out.achievements || [],
        players: out.player_names,
        playerStartTag: out.player_start_tag,
        playerStartTagName: out.player_start_tag_name,
        gameDifficulty: toDbDifficulty(out.game_difficulty),
        aar: metadata.aar,
        playthroughId: out.playthrough_id,
      };

      const { db, close } = usingDb(context);
      try {
        await db.transaction(async (tx) => {
          await tx.insert(table.saves).values(newSave);
          await uploadTask;
        });
      } finally {
        close();
      }

      log.event({
        userId: session.id,
        event: "Save created",
        key: saveId,
      });

      const response: SavePostResponse = {
        save_id: saveId,
      };

      const og = pdxOg({ s3, context });
      if (og.enabled) {
        const ogGeneration = og.generateOgIntoS3(saveId).catch((err) => {
          log.exception(err, { msg: "unable to generate og image" });
        });
        context.cloudflare.ctx.waitUntil(ogGeneration);
      }

      return Response.json(response);
    } catch (ex) {
      // If anything goes awry, delete the s3 file if it was uploaded
      const deleteFileFromS3 = uploadTask
        .then(() => s3.deleteFile(s3Key))
        .catch((err) => {
          log.exception(err, { msg: "unable to delete file from s3", saveId });
        });
      context.cloudflare.ctx.waitUntil(deleteFileFromS3);

      // If we have a unique constraint violation, let's assume it is the
      // idx_save_hash and throw a validation error.
      // https://www.postgresql.org/docs/current/errcodes-appendix.html
      if (ex && typeof ex === "object" && "code" in ex && ex.code === "23505") {
        throw new ValidationError("save already exists");
      }

      throw ex;
    }
  },
);
