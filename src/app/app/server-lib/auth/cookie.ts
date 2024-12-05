import { check } from "@/lib/isPresent";
import {
  AppLoadContext,
  createCookieSessionStorage,
} from "@remix-run/cloudflare";
import { z } from "zod";
import { userId } from "@/lib/auth";

export type PdxSessionStorage = ReturnType<typeof pdxCookieSession>;
export const pdxCookieSession = ({
  request,
  ...rest
}: {
  request: Request;
} & (
  | {
      context: AppLoadContext;
    }
  | { secret: string }
)) => {
  const secret =
    "secret" in rest ? rest.secret : rest.context.cloudflare.env.SESSION_SECRET;
  const storage = createCookieSessionStorage({
    cookie: {
      name: "sid",
      secrets: [check(secret)],
      sameSite: "strict",
      httpOnly: true,
      secure: true,
      maxAge: 60 * 60 * 24 * 30,
    },
  });

  return {
    new: () => storage.getSession(),
    get: async () => {
      try {
        const session = await storage.getSession(request.headers.get("Cookie"));
        const parsed = SessionPayloadSchema.parse(session.data);
        return { kind: "user", ...parsed } as const;
      } catch (_ex) {
        return { kind: "guest" } as const;
      }
    },
    commit: storage.commitSession,
    destroy: async () => storage.destroySession(await storage.getSession()),
  };
};

export type PdxSession = Awaited<ReturnType<PdxSessionStorage["get"]>>;
export type PdxUserSession = Extract<PdxSession, { kind: "user" }>;

const SessionPayloadSchema = z
  .object({
    userId: z.string().transform((x) => userId(x)),
    steamId: z.string(),
    account: z.enum(["free", "admin"]),
  })
  .strict();

export type SessionPayload = z.infer<typeof SessionPayloadSchema>;
