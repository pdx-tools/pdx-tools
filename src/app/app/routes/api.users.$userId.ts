import { getUser } from "@/server-lib/db";
import { withDb } from "@/server-lib/db/middleware";
import { withCore } from "@/server-lib/middleware";
import { json, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { z } from "zod";

const UserParams = z.object({ userId: z.string() });
export const loader = withCore(
  withDb(async ({ params }: LoaderFunctionArgs, { db }) => {
    const input = UserParams.parse(params);
    return json(await getUser(db, input.userId));
  }),
);
