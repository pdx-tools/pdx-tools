import Link from "next/link";
import React from "react";
import steam_login_image from "./sign-in-through-steam.png";

export const SteamButton = () => {
  return (
    <button>
      <Link href="/api/login/steam">
        <a>
          <img
            alt="login via steam"
            src={steam_login_image}
            width="180"
            height="35"
          />
        </a>
      </Link>
      <style jsx>{`
        button,
        a {
          border: 0;
          background: transparent;
        }

        button:hover,
        a:hover {
          outline: initial;
        }

        img:hover {
          filter: brightness(85%);
        }
      `}</style>
    </button>
  );
};
