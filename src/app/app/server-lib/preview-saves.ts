import { WorkerEntrypoint } from "cloudflare:workers";
import { z } from "zod";
import { saveObjectResponse } from "./save-object-response";

const saveRequest = z.object({
  game: z.enum(["eu4", "eu5"]),
  id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
});

type SaveConditions = { ifNoneMatch?: string; ifModifiedSince?: string };

/** Give previews access only to public save reads. */
export class PreviewSaves extends WorkerEntrypoint<{ SAVE_BUCKET: R2Bucket }> {
  async getSave(game: "eu4" | "eu5", id: string, conditions: SaveConditions = {}) {
    const input = saveRequest.safeParse({ game, id });
    if (!input.success) {
      return new Response("Invalid save request", { status: 400 });
    }

    const headers = new Headers();
    if (conditions.ifNoneMatch !== undefined) {
      headers.set("if-none-match", conditions.ifNoneMatch);
    }
    if (conditions.ifModifiedSince !== undefined) {
      headers.set("if-modified-since", conditions.ifModifiedSince);
    }
    return saveObjectResponse(this.env.SAVE_BUCKET, input.data.game, input.data.id, headers);
  }
}
