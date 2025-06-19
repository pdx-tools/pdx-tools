import { userId } from "@/lib/auth";
import { getUser } from "@/server-lib/db";
import { withDb } from "@/server-lib/db/middleware";
import { withCore } from "@/server-lib/middleware";
import type { Route } from "./+types/api.users.$userId";
import { z } from "zod";

const UserParams = z.object({ userId: z.string() });
export const loader = withCore(
  withDb(async ({ params }: Route.LoaderArgs, { db }) => {
    const input = UserParams.parse(params);
    return Response.json(await getUser(db, userId(input.userId)));
  }),
);
