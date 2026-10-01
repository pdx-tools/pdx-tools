import { saveFileResponse } from "@/server-lib/save-file";
import { z } from "zod";
import type { Route } from "./+types/api.eu5.saves.$saveId.file";

const saveSchema = z.object({ saveId: z.string() });

export async function loader({ request, url, params, context }: Route.LoaderArgs) {
  const { saveId } = saveSchema.parse(params);
  return saveFileResponse({ request, url, context, saveId, game: "eu5" });
}
