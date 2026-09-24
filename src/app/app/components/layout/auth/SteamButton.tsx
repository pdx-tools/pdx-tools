import { Link } from "@/components/Link";
import steam_login_image from "./sign-in-through-steam.png";

const externalAddress = import.meta.env.VITE_EXTERNAL_ADDRESS;

function callbackUrl(returnTo?: string) {
  const base = `${externalAddress}/api/login/steam-callback`;
  return returnTo ? `${base}?returnTo=${encodeURIComponent(returnTo)}` : base;
}

function steamLoginUrl(returnTo?: string) {
  if (!externalAddress) {
    return undefined;
  }

  const params = {
    "openid.ns": "http://specs.openid.net/auth/2.0",
    "openid.sreg": "http://openid.net/extensions/sreg/1.1",
    "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
    "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
    "openid.mode": "checkid_setup",
    "openid.realm": externalAddress,
    "openid.return_to": callbackUrl(returnTo),
  };

  const steamUrl = new URL("https://steamcommunity.com/openid/login");
  steamUrl.search = new URLSearchParams(params).toString();
  return steamUrl;
}

/**
 * Where a plain link sends a visitor to sign in. Production goes through
 * Steam; a dev build without an external address takes the callback's
 * shortcut, the same request the form below makes.
 */
export function steamLoginHref(returnTo?: string): string {
  const steamUrl = steamLoginUrl(returnTo);
  if (steamUrl) return steamUrl.toString();
  const params = new URLSearchParams(returnTo ? { returnTo } : {});
  const query = params.toString();
  return query ? `/api/login/steam-callback?${query}` : "/api/login/steam-callback";
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

function SteamForm({ returnTo }: { returnTo?: string }) {
  return (
    <form method="GET" action="/api/login/steam-callback">
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
      <button type="submit">
        <SteamImage />
      </button>
    </form>
  );
}

export const SteamButton = ({ returnTo }: { returnTo?: string }) => {
  const steamUrl = steamLoginUrl(returnTo);
  if (steamUrl) {
    return (
      <Link
        href={`${steamUrl}`}
        className="hover:outline-initial border-none bg-transparent"
        target="_self"
      >
        <SteamImage />
      </Link>
    );
  } else {
    return <SteamForm returnTo={returnTo} />;
  }
};
