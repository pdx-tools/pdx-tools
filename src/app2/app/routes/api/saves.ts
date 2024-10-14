import { timeit } from '@/lib/timeit';
import { withAuth } from '@/server-lib/auth/middleware'
import { dbPool, NewSave, table, toDbDifficulty } from '@/server-lib/db';
import { ValidationError } from '@/server-lib/errors';
import { genId } from '@/server-lib/id';
import { log } from '@/server-lib/logging';
import { withCore } from '@/server-lib/middleware'
import { headerMetadata, SavePostResponse, uploadMetadata } from '@/server-lib/models';
import { generateOgIntoS3 } from '@/server-lib/og';
import { deleteFile, s3Keys, uploadFileToS3 } from '@/server-lib/s3';
import { parseSave } from '@/server-lib/save-parser';
import { json } from '@tanstack/start'
import { createAPIFileRoute } from '@tanstack/start/api'

async function fileUploadData(req: Request) {
  const maxFileSize = 20 * 1024 * 1024;
  const contentType = req.headers.get("content-type");
  if (contentType?.toLowerCase()?.includes("form-data")) {
    const form = await timeit(() => req.formData());
    log.info({
      msg: "upload form data",
      elapsedMs: form.elapsedMs.toFixed(2),
    });

    const file = form.data.get("file") as Blob | null;
    if (!file || file.size > maxFileSize) {
      throw new ValidationError("invalid file upload");
    }

    const metadataBody = (form.data.get("metadata") ?? "{}") as string;
    const metadata = uploadMetadata.parse(JSON.parse(metadataBody));
    const bytes = new Uint8Array(await file.arrayBuffer());
    return { bytes, metadata };
  } else {
    const lengthHeader = req.headers.get("content-length");
    if (!(lengthHeader && +lengthHeader < maxFileSize)) {
      throw new ValidationError("invalid file upload");
    }

    const headers = Object.fromEntries(req.headers.entries());
    const metadata = headerMetadata.parse(headers);
    const bytes = new Uint8Array(await req.arrayBuffer());
    return { bytes, metadata };
  }
}

export const Route = createAPIFileRoute('/api/saves')({
  POST: withCore(withAuth(async ({ request }, {session}) => {
    const { bytes, metadata } = await fileUploadData(request);
    const saveId = genId(12);
  
    // Optimistically start upload to s3, the longest stage
    const uploadTask = uploadFileToS3(bytes, saveId, metadata.uploadType);
  
    try {
      const { data: out, elapsedMs } = await timeit(() => parseSave(bytes));
      log.info({
        key: saveId,
        user: session.uid,
        msg: "parsed file",
        elapsedMs: elapsedMs.toFixed(2),
      });
  
      if (out.kind === "InvalidPatch") {
        throw new ValidationError(`unsupported patch: ${out.patch_shorthand}`);
      }
  
      const newSave: NewSave = {
        id: saveId,
        userId: session.uid,
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
  
      const db = dbPool().orm;
      await db.transaction(async (tx) => {
        await tx.insert(table.saves).values(newSave);
        await uploadTask;
      });
  
      log.event({
        userId: session.uid,
        event: "Save created",
        key: saveId,
      });
  
      const response: SavePostResponse = {
        save_id: saveId,
      };
  
      if (process.env.PUPPETEER_URL) {
        generateOgIntoS3(saveId).catch((err) => {
          log.exception(err, { msg: "unable to generate og image" });
        });
      }
  
      return json(response);
    } catch (ex) {
      try {
        // If anything goes awry, delete the s3 file if it was uploaded
        await uploadTask.then(() => deleteFile(s3Keys.save(saveId)));
      } finally {
        // If we have a unique constraint violation, let's assume it is the
        // idx_save_hash and throw a validation error.
        // https://www.postgresql.org/docs/current/errcodes-appendix.html
        if (ex && typeof ex === "object" && "code" in ex && ex.code === "23505") {
          throw new ValidationError("save already exists");
        }
  
        throw ex;
      }
    }
  })),
})
