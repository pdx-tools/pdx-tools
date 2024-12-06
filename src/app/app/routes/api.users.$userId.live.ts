import { userId } from "@/lib/auth";
import { liveRoom } from "@/server-lib/live";
import { withCore } from "@/server-lib/middleware";
import { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { z } from "zod";

const UserParams = z.object({ userId: z.string() });
export const loader = withCore(
  async ({ params, request, context }: LoaderFunctionArgs) => {
    const user = UserParams.parse(params);
    const stub = liveRoom(userId(user.userId), context);
    const doUrl = new URL(`/${user.userId}`, request.url);
    return stub.fetch!(new Request(doUrl, request));
  },
);
