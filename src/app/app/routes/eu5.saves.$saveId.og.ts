import { mediaOrigin } from "@/lib/media";
import { pdxStorage } from "@/server-lib/storage";
import { redirect } from "react-router";
import { z } from "zod";
import type { Route } from "./+types/eu5.saves.$saveId.og";

const Params = z.object({ saveId: z.string().regex(/^[a-z0-9_-]+$/i) });

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const { saveId } = Params.parse(params);
  if (mediaOrigin) return redirect(`${mediaOrigin}/eu5/og/${saveId}.webp`, 301);

  const object = await pdxStorage({ context, game: "eu5" }).previews.get(saveId, {
    onlyIf: request.headers,
  });
  if (!object) return new Response(null, { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  if (!("body" in object)) return new Response(null, { status: 304, headers });
  return new Response(object.body, { headers });
}
