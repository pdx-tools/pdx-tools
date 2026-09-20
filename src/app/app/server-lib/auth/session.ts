import { check } from "@/lib/isPresent";
import { createCookieSessionStorage } from "react-router";
import { getCloudflare } from "../cloudflare-context";
import type { PdxRouteContext } from "../cloudflare-context";
import { parseBasicAuth } from "./basic";
import { oneshotDb } from "../db/connection";
import { apiKeyAtRest, table } from "../db";
import type { User } from "../db";
import { eq } from "drizzle-orm";
import type { LoggedInUser, UserId } from "@/lib/auth";
import { isSessionStale, knownFeatures, SessionPayloadSchema, sessionPayload } from "./payload";
import type { PdxSession, PdxUserSession, SessionPayload } from "./payload";

export * from "./payload";

export type PdxSessionStorage = ReturnType<typeof pdxSession>;
export const pdxSession = ({
  request,
  context,
}: {
  request: Request;
  context: PdxRouteContext;
}) => {
  const cloudflare = getCloudflare(context);
  const storage = createCookieSessionStorage<SessionPayload>({
    cookie: {
      name: cloudflare.env.SESSION_COOKIE_NAME ?? "sid",
      secrets: [check(cloudflare.env.SESSION_SECRET, "missing session secret")],
      sameSite: "strict",
      httpOnly: true,
      secure: true,
      maxAge: 60 * 60 * 24 * 30,
    },
  });

  const issue = async (payload: SessionPayload) => {
    const session = await storage.getSession();
    session.set("userId", payload.userId);
    session.set("steamId", payload.steamId);
    session.set("account", payload.account);
    session.set("features", payload.features);
    session.set("issuedAt", payload.issuedAt);
    return storage.commitSession(session);
  };

  const destroy = async () => storage.destroySession(await storage.getSession());

  return {
    get: async (): Promise<PdxSession> => {
      try {
        const session = await storage.getSession(request.headers.get("Cookie"));
        const parsed = SessionPayloadSchema.parse(session.data);
        return { kind: "user", ...parsed };
      } catch {
        return { kind: "guest" };
      }
    },

    // Create a session cookie for a user who has just logged in.
    issue,
    destroy,

    // Read the user row again and issue a new cookie. Callers must send the
    // returned cookie in the `Set-Cookie` header of their response. A deleted
    // user results in a guest session and a cookie that clears the session.
    refresh: async (current: PdxUserSession): Promise<{ session: PdxSession; cookie: string }> => {
      const user = await lookupUser(cloudflare.env.PDX_DB.connectionString, current.userId);
      if (user === undefined) {
        return { session: { kind: "guest" }, cookie: await destroy() };
      }

      const payload = sessionPayload({ ...user, steamId: current.steamId });
      return { session: { kind: "user", ...payload }, cookie: await issue(payload) };
    },
  };
};

async function lookupUser(connectionString: string, id: UserId) {
  const users = await oneshotDb(connectionString, (db) =>
    db
      .select({
        userId: table.users.userId,
        account: table.users.account,
        features: table.users.features,
      })
      .from(table.users)
      .where(eq(table.users.userId, id)),
  );
  return users.at(0);
}

const unauthResponse = () => Response.json({ msg: "unable to authorize" }, { status: 401 });

const toRoles = (account: User["account"]): LoggedInUser["roles"] => [
  account === "admin" ? "admin" : "user",
];

export async function getAuth({
  request,
  context,
}: {
  request: Request;
  context: PdxRouteContext;
}): Promise<LoggedInUser> {
  const cloudflare = getCloudflare(context);
  const header = request.headers.get("authorization");
  if (header) {
    const creds = parseBasicAuth(header);
    if (creds === null) {
      throw unauthResponse();
    }

    const users = await oneshotDb(cloudflare.env.PDX_DB.connectionString, (db) =>
      db
        .select({
          apiKey: table.users.apiKey,
          account: table.users.account,
          features: table.users.features,
        })
        .from(table.users)
        .where(eq(table.users.userId, creds.username)),
    );
    const user = users[0];

    if (user?.apiKey !== (await apiKeyAtRest(creds.password))) {
      throw unauthResponse();
    }

    return {
      id: creds.username,
      roles: toRoles(user.account),
      features: knownFeatures(user.features),
    };
  } else {
    const session = await pdxSession({ request, context }).get();
    if (session.kind === "guest") {
      throw unauthResponse();
    }

    // A stale cookie can not be replaced here as the caller owns the
    // response, but the fresh data is still used for this request. The
    // cookie itself is replaced when the client next loads `/api/profile`.
    if (isSessionStale(session)) {
      const user = await lookupUser(cloudflare.env.PDX_DB.connectionString, session.userId);
      if (user === undefined) {
        throw unauthResponse();
      }

      return {
        id: user.userId,
        roles: toRoles(user.account),
        features: knownFeatures(user.features),
      };
    }

    return {
      id: session.userId,
      roles: toRoles(session.account),
      features: session.features,
    };
  }
}
