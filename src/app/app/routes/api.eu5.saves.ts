import postgres from "postgres";
import { DrizzleQueryError } from "drizzle-orm/errors";
import { ensureFeature } from "@/lib/auth";
import { timeit } from "@/lib/timeit";
import { getAuth } from "@/server-lib/auth/session";
import { table } from "@/server-lib/db";
import type { NewEu5Save } from "@/server-lib/db";
import { usingDb } from "@/server-lib/db/connection";
import { ValidationError } from "@/server-lib/errors";
import { parseApiFromEnv, pdxFns } from "@/server-lib/functions";
import { genId } from "@/server-lib/id";
import { log } from "@/server-lib/logging";
import { withCore } from "@/server-lib/middleware";
import { eu5HeaderMetadata, uploadContentType } from "@/server-lib/models";
import type { SavePostResponse } from "@/server-lib/models";
import { pdxStorage } from "@/server-lib/storage";
import { pdxOg } from "@/server-lib/og";
import { getCloudflare } from "@/server-lib/cloudflare-context";
import type { Route } from "./+types/api.eu5.saves";

/** The save date in ISO 8601 (`yyyy-mm-dd`), the format of EU4 save dates. */
function isoDate({ year, month, day }: { year: number; month: number; day: number }) {
  const pad = (value: number, width: number) => String(value).padStart(width, "0");
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

const MAX_UPLOAD_BYTES = 90 * 1024 * 1024;

/**
 * Validate the upload without reading the body. The body is streamed into
 * storage, so the size check comes from the content length. R2 only accepts
 * a stream of known length, so the body is bound to that length, which also
 * rejects a body that does not match it.
 */
function uploadRequest(request: Request) {
  const contentLength = Number(request.headers.get("content-length"));
  if (!Number.isInteger(contentLength) || contentLength <= 0 || !request.body) {
    throw new ValidationError("EU5 uploads must have a content length");
  }

  if (contentLength > MAX_UPLOAD_BYTES) {
    throw new ValidationError("EU5 upload exceeds the 90 MiB limit");
  }

  return {
    body: request.body.pipeThrough(new FixedLengthStream(contentLength)),
    contentLength,
    metadata: eu5HeaderMetadata.parse(Object.fromEntries(request.headers.entries())),
  };
}

export const action = withCore(async ({ request, context }: Route.ActionArgs) => {
  if (request.method !== "POST") {
    throw Response.json({ msg: "Method not allowed" }, { status: 405 });
  }

  const session = await getAuth({ request, context });
  ensureFeature(session, "eu5-upload");
  const { body, contentLength, metadata } = uploadRequest(request);
  const cloudflare = getCloudflare(context);
  const storage = pdxStorage({ context, game: "eu5" });
  const saveId = genId(12);

  // The save is streamed into storage first and read back from there for
  // parsing and the preview, so the Worker never holds the whole file in
  // memory. Saves can be close to the upload limit, which the isolate cannot
  // hold twice over.
  await storage.saves.put(saveId, body, {
    httpMetadata: { contentType: uploadContentType(metadata.uploadType) },
  });

  // Parse the stored save and record it. When this fails, the stored object
  // has no row, so it is deleted.
  const record = async () => {
    const stored = await storage.saves.get(saveId);
    if (!stored) {
      throw new Error(`EU5 save ${saveId} missing from storage after upload`);
    }

    const parsed = await timeit(() =>
      pdxFns(parseApiFromEnv(cloudflare.env)).parseEu5Save(stored.body),
    );

    const newSave: NewEu5Save = {
      id: saveId,
      userId: session.id,
      filename: metadata.filename,
      hash: parsed.data.hash,
      date: isoDate(parsed.data.date),
      playthroughId: parsed.data.playthroughId,
      playthroughName: parsed.data.playthroughName,
      players: parsed.data.players,
      playerTag: parsed.data.playerCountry?.tag,
      playerFlag: parsed.data.playerCountry?.flag,
      playerCountryName: parsed.data.playerCountry?.name,
      versionMajor: parsed.data.version.major,
      versionMinor: parsed.data.version.minor,
      versionPatch: parsed.data.version.patch,
    };

    const { db, close } = usingDb(context);
    try {
      await db.insert(table.eu5Saves).values(newSave);
    } finally {
      close();
    }
    return parsed;
  };

  const parsed = await record().catch((error: unknown) => {
    cloudflare.ctx.waitUntil(
      storage.saves
        .delete(saveId)
        .catch((cleanupError) =>
          log.exception(cleanupError, { msg: "unable to delete failed EU5 upload", saveId }),
        ),
    );

    if (
      error instanceof DrizzleQueryError &&
      error.cause instanceof postgres.PostgresError &&
      error.cause.code === "23505"
    ) {
      throw new ValidationError("save already exists");
    }
    throw error;
  });

  log.info({
    msg: "uploaded an EU5 save",
    key: saveId,
    user: session.id,
    bytes: contentLength,
    parseElapsedMs: parsed.elapsedMs.toFixed(2),
  });
  const og = pdxOg({ storage, context, game: "eu5" });
  if (og.enabled) {
    const preview = og
      .generateOgIntoStorage(saveId)
      .catch((error) => log.exception(error, { msg: "unable to generate EU5 preview", saveId }));
    cloudflare.ctx.waitUntil(preview);
  }
  return Response.json({ save_id: saveId } satisfies SavePostResponse);
});
