import { ValidationError } from "./errors";
import { fetchOk, fetchOkJson } from "@/lib/fetch";
import { check } from "@/lib/isPresent";
import { log } from "./logging";
import { z } from "zod";
import type { AppLoadContext } from "react-router";

const SteamSchema = z.object({
  response: z.object({
    players: z
      .array(
        z.object({
          personaname: z.string(),
        }),
      )
      .nonempty(),
  }),
});

export const pdxSteam = ({ context }: { context: AppLoadContext }) => {
  const apiKey = context.cloudflare.env.STEAM_API_KEY;
  const loginAddress = context.cloudflare.env.STEAM_LOGIN_ADDRESS;

  return {
    loginVerify: async (data: URLSearchParams) => {
      data.set("openid.mode", "check_authentication");
      const claimId = check(
        data.get("openid.claimed_id"),
        "missing claimed_id",
      );
      const url = new URL(getSingleInstance(claimId));
      const uid = url.pathname.substring(url.pathname.lastIndexOf("/") + 1);

      log.info({ msg: "Steam verification request", uid, loginAddress });
      const response = await fetchOk(`${loginAddress}/openid/login`, {
        method: "POST",
        body: data,
        headers: {
          // https://github.com/cloudflare/workerd/issues/3066
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
      });

      const body = await response.text();
      if (body.indexOf("is_valid:true") === -1) {
        throw new ValidationError(`steam unable to validate request: ${body}`);
      } else {
        log.info({ msg: "Steam verified", uid });
        return uid;
      }
    },
    getPlayerName: async (steamUid: string) => {
      const params = new URLSearchParams([
        ["key", apiKey],
        ["steamids", steamUid],
      ]);
      const body = await fetchOkJson(
        `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002?${params}`,
      );
      const resp = SteamSchema.safeParse(body);
      if (!resp.success) {
        throw new ValidationError("could not retrieve player name from steam");
      }

      return resp.data.response.players[0].personaname;
    },
  };
};

function getSingleInstance(data: string | string[]): string {
  if (Array.isArray(data)) {
    throw new ValidationError("expected single instance");
  } else {
    return data;
  }
}
