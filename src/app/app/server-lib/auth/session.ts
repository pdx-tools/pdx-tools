import { check } from "@/lib/isPresent";
import {
  AppLoadContext,
  createCookieSessionStorage,
  json,
} from "@remix-run/cloudflare";
import { z } from "zod";
import { parseBasicAuth } from "./basic";
import { useDb } from "../db/connection";
import { apiKeyAtRest, table } from "../db";
import { eq } from "drizzle-orm";

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
      secrets: [check(context.cloudflare.env.SESSION_SECRET)],
      sameSite: "strict",
      httpOnly: true,
      secure: true,
      maxAge: 60 * 60 * 24 * 30,
    },
  });

  return {
    new: () => storage.getSession(),
    get: async () => {
      const session = await storage.getSession(request.headers.get("Cookie"));
      const parsed = SessionPayloadSchema.safeParse(session.data);
      if (parsed.success) {
        return {
          kind: "user",
          ...parsed.data,
        } as const;
      } else {
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
    userId: z.string(),
    steamId: z.string(),
    account: z.enum(["free", "admin"]),
  })
  .strict();

export type SessionPayload = z.infer<typeof SessionPayloadSchema>;

const unauthResponse = () =>
  json({ msg: "unable to authorize" }, { status: 401 });

export type Session = Awaited<ReturnType<typeof getAuth>>;
export async function getAuth({
  request,
  context,
}: {
  request: Request;
  context: AppLoadContext;
}) {
  const header = request.headers.get("authorization");
  if (header) {
    const creds = parseBasicAuth(header);
    if (creds === null) {
      throw unauthResponse();
    }

    const users = await useDb(
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

    return { uid: creds.username, account: user.account };
  } else {
    const session = await pdxSession({ request, context }).get();
    if (session.kind === "guest") {
      throw unauthResponse();
    }

    return { uid: session.userId, account: session.account };
  }
}

export async function getAdmin({
  request,
  context,
}: {
  request: Request;
  context: AppLoadContext;
}) {
  const session = await getAuth({ request, context });
  if (session.account !== "admin") {
    throw unauthResponse();
  }

  return session;
}