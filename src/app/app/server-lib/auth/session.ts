import { check } from "@/lib/isPresent";
import { createCookieSessionStorage } from "react-router";
import type { AppLoadContext } from "react-router";
import { z } from "zod";
import { parseBasicAuth } from "./basic";
import { oneshotDb } from "../db/connection";
import { apiKeyAtRest, table } from "../db";
import { eq } from "drizzle-orm";
import { userId } from "@/lib/auth";
import type { LoggedInUser } from "@/lib/auth";

export type PdxSessionStorage = ReturnType<typeof pdxSession>;
export const pdxSession = ({
  request,
  context,
}: {
  request: Request;
  context: AppLoadContext;
}) => {
  const storage = createCookieSessionStorage({
    cookie: {
      name: "sid",
      secrets: [
        check(context.cloudflare.env.SESSION_SECRET, "missing session secret"),
      ],
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
      } catch {
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

const unauthResponse = () =>
  Response.json({ msg: "unable to authorize" }, { status: 401 });

export async function getAuth({
  request,
  context,
}: {
  request: Request;
  context: AppLoadContext;
}): Promise<LoggedInUser> {
  const header = request.headers.get("authorization");
  if (header) {
    const creds = parseBasicAuth(header);
    if (creds === null) {
      throw unauthResponse();
    }

    const users = await oneshotDb(
      context.cloudflare.env.PDX_DB.connectionString,
      (db) =>
        db
          .select({ apiKey: table.users.apiKey, account: table.users.account })
          .from(table.users)
          .where(eq(table.users.userId, creds.username)),
    );
    const user = users[0];

    if (user?.apiKey !== (await apiKeyAtRest(creds.password))) {
      throw unauthResponse();
    }

    return {
      id: creds.username,
      roles: [user.account === "admin" ? "admin" : "user"],
    };
  } else {
    const session = await pdxSession({ request, context }).get();
    if (session.kind === "guest") {
      throw unauthResponse();
    }

    return {
      id: session.userId,
      roles: [session.account === "admin" ? "admin" : "user"],
    };
  }
}
