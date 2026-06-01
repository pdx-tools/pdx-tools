import postgres from "postgres";
import { DrizzleQueryError } from "drizzle-orm/errors";
import { ensurePermissions } from "@/lib/auth";
import { timeit } from "@/lib/timeit";
import { getAuth } from "@/server-lib/auth/session";
import { table, toDbDifficulty } from "@/server-lib/db";
import type { NewSave } from "@/server-lib/db";
import { usingDb } from "@/server-lib/db/connection";
import { ValidationError } from "@/server-lib/errors";
import { pdxFns } from "@/server-lib/functions";
import { genId } from "@/server-lib/id";
import { log } from "@/server-lib/logging";
import { pdxMetrics } from "@/server-lib/metrics";
import { captureEvent } from "@/server-lib/posthog";
import { withCore } from "@/server-lib/middleware";
import { headerMetadata, uploadContentType, uploadMetadata } from "@/server-lib/models";
import type { SavePostResponse } from "@/server-lib/models";
import { pdxOg } from "@/server-lib/og";
import { pdxStorage } from "@/server-lib/storage";
import type { Route } from "./+types/api.saves";

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

export const action = withCore(async ({ request, context }: Route.ActionArgs) => {
  if (request.method !== "POST") {
    throw Response.json({ msg: "Method not allowed" }, { status: 405 });
  }

  const session = await getAuth({ request, context });
  ensurePermissions(session, "savefile:create");
  const { bytes, metadata } = await fileUploadData(request);
  const saveId = genId(12);
  const storage = pdxStorage({ context });
  const metrics = pdxMetrics(context);

  // Optimistically start upload, the longest stage
  const uploadTask = timeit(() =>
    storage.saves.put(saveId, bytes, {
      httpMetadata: { contentType: uploadContentType(metadata.uploadType) },
    }),
  ).then((put) => {
    log.info({
      msg: "uploaded a new save file",
      key: saveId,
      bytes: bytes.length,
      elapsedMs: put.elapsedMs.toFixed(2),
    });
    return { elapsedMs: put.elapsedMs, bytes: bytes.length };
  });
  uploadTask.then(
    (put) =>
      metrics.record({
        domain: "save_file",
        operation: "save_file_put",
        outcome: "success",
        status: 200,
        elapsedMs: put.elapsedMs,
        bytes: put.bytes,
      }),
    () =>
      metrics.record({
        domain: "save_file",
        operation: "save_file_put",
        outcome: "error",
        status: "error",
        elapsedMs: 0,
        bytes: bytes.length,
      }),
  );

  try {
    const parsed = await timeit(() =>
      pdxFns({
        endpoint: context.cloudflare.env.PARSE_API_ENDPOINT,
      }).parseSave(bytes),
    ).catch((err) => {
      metrics.record({
        domain: "parse_api",
        operation: "parse_save",
        outcome: "error",
        status: "error",
        elapsedMs: 0,
        bytes: bytes.length,
      });
      throw err;
    });
    const out = parsed.data;
    metrics.record({
      domain: "parse_api",
      operation: "parse_save",
      outcome: "success",
      status: 200,
      elapsedMs: parsed.elapsedMs,
      bytes: bytes.length,
    });
    log.info({
      key: saveId,
      user: session.id,
      msg: "parsed file",
      elapsedMs: parsed.elapsedMs.toFixed(2),
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

    captureEvent({
      userId: session.id,
      event: "Save created",
      key: saveId,
    });

    const response: SavePostResponse = {
      save_id: saveId,
    };

    const og = pdxOg({ storage, context });
    if (og.enabled) {
      const ogGeneration = og.generateOgIntoStorage(saveId, bytes.buffer).catch((err) => {
        log.exception(err, { msg: "unable to generate og image" });
      });
      context.cloudflare.ctx.waitUntil(ogGeneration);
    }

    return Response.json(response);
  } catch (ex) {
    // If anything goes awry, delete the stored file if it was uploaded
    const deleteUploadedFile = uploadTask
      .then(() => storage.saves.delete(saveId))
      .catch((err) => {
        log.exception(err, { msg: "unable to delete uploaded save file", saveId });
      });
    context.cloudflare.ctx.waitUntil(deleteUploadedFile);

    // If we have a unique constraint violation, let's assume it is the
    // idx_save_hash and throw a validation error.
    // https://www.postgresql.org/docs/current/errcodes-appendix.html
    if (
      ex instanceof DrizzleQueryError &&
      ex.cause instanceof postgres.PostgresError &&
      ex.cause.code === "23505"
    ) {
      throw new ValidationError("save already exists");
    }

    throw ex;
  }
});
