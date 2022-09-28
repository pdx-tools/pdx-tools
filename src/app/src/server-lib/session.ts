import { NextApiRequest, NextApiResponse } from "next";
import { getEnv } from "./env";
import { withIronSessionApiRoute } from "iron-session/next";
import { getIronSession, IronSession } from "iron-session";
import { apiKeyAtRest, db } from "./db";

declare module "iron-session" {
  interface IronSessionData {
    user?: SessionData;
  }
}

export type NextSessionRequest = NextApiRequest & {
  sessionUid: string;
};

export interface SessionData {
  uid: string;
}

export const COOKIE_NAME = "session";

export const sessionOptions = {
  password: {
    1: getEnv("SESSION_SECRET"),
  },
  cookieName: COOKIE_NAME,
};

export async function extractSession(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<IronSession> {
  return await getIronSession(req, res, sessionOptions);
}

interface AuthCredentials {
  username: string;
  password: string;
}

// impl from dropwizard: BasicCredentialAuthFilter
export function parseBasicAuth(header: string): AuthCredentials | null {
  const space = header.indexOf(" ");
  if (space <= 0) {
    return null;
  }

  const method = header.substring(0, space);
  if (method.toLowerCase() !== "basic") {
    return null;
  }

  const rest = header.substring(space + 1);
  const decoded = Buffer.from(rest, "base64url").toString("utf-8");
  const sep = decoded.indexOf(":");
  if (sep <= 0) {
    return null;
  }

  const username = decoded.substring(0, sep);
  const password = decoded.substring(sep + 1);
  return { username, password };
}

type Handler = Parameters<typeof withIronSessionApiRoute>[0];
export const withHttpSession = (
  handler: Handler
): ReturnType<typeof withIronSessionApiRoute> => {
  return withIronSessionApiRoute(handler, sessionOptions);
};

export const withSession = (
  handler: (
    req: NextSessionRequest,
    res: NextApiResponse
  ) => void | Promise<void>
) => {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    const header = req.headers.authorization;
    if (header) {
      const creds = parseBasicAuth(header);
      if (creds === null) {
        res.status(401).json({ msg: "unable to parse auth header" });
        return;
      }

      const user = await db.user.findUnique({
        where: {
          userId: creds.username,
        },
        select: {
          apiKey: true,
        },
      });

      if (user?.apiKey !== apiKeyAtRest(creds.password)) {
        res.status(401).json({ msg: "invalid credentials" });
        return;
      }

      const x = req as NextSessionRequest;
      x.sessionUid = creds.username;
      await handler(x, res);
    } else {
      await withHttpSession(async (req, res) => {
        if (req.session.user === undefined) {
          res.status(401).json({ msg: "must be logged in" });
        } else {
          const out = req as NextSessionRequest;
          out.sessionUid = req.session.user.uid;
          await handler(out, res);
        }
      })(req, res);
    }
  };
};
