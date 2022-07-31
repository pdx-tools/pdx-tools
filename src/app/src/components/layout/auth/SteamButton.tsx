import Link from "next/link";
import React from "react";
import steam_login_image from "./sign-in-through-steam.png";

export const SteamButton = () => {
  return (
    <button className="border-none bg-transparent hover:outline-initial">
      <Link href="/api/login/steam">
        <a className="border-none bg-transparent hover:outline-initial">
          <img
            className="hover:brightness-90"
            alt="login via steam"
            src={steam_login_image}
            width="180"
            height="35"
          />
        </a>
      </Link>
    </button>
  );
};
