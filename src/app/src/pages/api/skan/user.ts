import { NextApiResponse } from "next";
import { getEnv } from "@/server-lib/env";
import { log } from "@/server-lib/logging";
import { withCoreMiddleware } from "@/server-lib/middlware";
import { NextSessionRequest, withSession } from "@/server-lib/session";
import { SkanUserSaves } from "@/services/appApi";
import { db, table } from "@/server-lib/db";
import { eq } from "drizzle-orm";

const handler = async (req: NextSessionRequest, res: NextApiResponse) => {
  if (req.method !== "GET") {
    res.status(405).json({ msg: "method not allowed" });
    return;
  }

  const apiKey = getEnv("SKAN_API_KEY");
  const query = await db
    .select({ steamId: table.users.steamId })
    .from(table.users)
    .where(eq(table.users.userId, req.sessionUid));
  const steamId = query[0]?.steamId;
  if (!steamId) {
    res
      .status(404)
      .json({ msg: "user does not have associated steam account" });
    return;
  }

  const params = new URLSearchParams({
    key: apiKey,
    scope: "fetchUserSaves",
    steamid: steamId,
  });
  const url = `https://skanderbeg.pm/api.php?` + params;
  log.info({ skanderbeg: url });
  const skanResponse = await fetch(url);
  const skanJson = await skanResponse.json();

  // If skanderbeg returns a string then it means an error message
  // This is intended according to jarvin: "Outputting an actual error message seems to be a
  // less confusing approach than outputting an empty array"
  if (typeof skanJson === "string") {
    const result: SkanUserSaves[] = [];
    res.json(result);
  } else {
    const result: SkanUserSaves[] = skanJson;
    res.json(result);
  }
};

export default withCoreMiddleware(withSession(handler));
