import Link from "next/link";
import React from "react";
import steam_login_image from "./sign-in-through-steam.png";
import { STEAM_URL } from "@/lib/steam";

const externalAddress = process.env.NEXT_PUBLIC_EXTERNAL_ADDRESS;
let steamUrl: URL | undefined;
if (externalAddress) {
  const params = {
    "openid.ns": "http://specs.openid.net/auth/2.0",
    "openid.sreg": "http://openid.net/extensions/sreg/1.1",
    "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
    "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
    "openid.mode": "checkid_setup",
    "openid.realm": externalAddress,
    "openid.return_to": `${externalAddress}/api/login/steam-callback`,
  };

  steamUrl = new URL(STEAM_URL);
  steamUrl.search = new URLSearchParams(params).toString();
}

function SteamImage() {
  return (
    <img
      className="hover:brightness-90"
      alt="login via steam"
      src={steam_login_image}
      width="180"
      height="35"
    />
  );
}

function SteamForm() {
  return (
    <form method="GET" action="/api/login/steam-callback">
      <button type="submit">
        <SteamImage />
      </button>
    </form>
  );
}

export const SteamButton = () => {
  if (steamUrl) {
    return (
      <Link
        href={steamUrl}
        className="hover:outline-initial border-none bg-transparent"
      >
        <SteamImage />
      </Link>
    );
  } else {
    return <SteamForm />;
  }
};
