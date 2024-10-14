import { withDb } from "@/server-lib/db/middleware";
import { getSaves } from "@/server-lib/fn/new";
import { withCore } from "@/server-lib/middleware";
import { json, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { z } from "zod";

const NewSchema = z.object({
  pageSize: z
    .number()
    .nullish()
    .transform((x) => x ?? 50),
  cursor: z.string().nullish(),
});

export type NewestSaveResponse = Awaited<ReturnType<typeof getSaves>>;

export const loader = withCore(
  withDb(async ({ request }: LoaderFunctionArgs, { db }) => {
    const searchParams = new URL(request.url).searchParams;
    const params = NewSchema.parse(Object.fromEntries(searchParams.entries()));
    return json(await getSaves(db, params));
  }),
);
