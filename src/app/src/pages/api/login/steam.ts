import { NextApiRequest, NextApiResponse } from "next";
import { db } from "@/server-lib/db";
import { getEnv, isLocal } from "@/server-lib/env";
import { withLogger } from "@/server-lib/logging";
import { withHttpSession } from "@/server-lib/session";

export const STEAM_URL = "https://steamcommunity.com/openid/login";
const TEST_UID = "100";

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (isLocal()) {
    const user = req.session.user;

    if (!user?.uid) {
      const user = await db.user.findUnique({
        where: {
          userId: TEST_UID,
        },
      });

      if (!user) {
        await db.user.create({
          data: {
            userId: TEST_UID,
            steamId: "1000",
            steamName: "my-steam-name",
          },
        });
      }

      req.session.user = { uid: TEST_UID };
      await req.session.save();
    }

    res.redirect("/");
  } else {
    const externalAddress = getEnv("EXTERNAL_ADDRESS");
    const url = loginRedirectUrl(externalAddress, "/api/login/steam-callback");
    res.redirect(307, url.toString());
  }
};

function loginRedirectUrl(external_address: string, callback: string) {
  const params = {
    "openid.ns": "http://specs.openid.net/auth/2.0",
    "openid.sreg": "http://openid.net/extensions/sreg/1.1",
    "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
    "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
    "openid.mode": "checkid_setup",
    "openid.realm": external_address,
    "openid.return_to": `${external_address}${callback}`,
  };

  const steamUrl = new URL(STEAM_URL);
  steamUrl.search = new URLSearchParams(params).toString();
  return steamUrl;
}

export default withLogger(withHttpSession(handler));
