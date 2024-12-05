import { pdxCookieSession } from "@/server-lib/auth/cookie";
import { ActionFunctionArgs, redirect } from "@remix-run/cloudflare";

export async function action({ request, context }: ActionFunctionArgs) {
  const sessionStorage = pdxCookieSession({ request, context });
  return redirect("/", {
    headers: {
      "Set-Cookie": await sessionStorage.destroy(),
    },
  });
}
