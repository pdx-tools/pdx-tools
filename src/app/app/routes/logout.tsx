import { pdxSession } from "@/server-lib/auth/session";
import { redirect } from "@remix-run/cloudflare";
import type { ActionFunctionArgs } from "@remix-run/cloudflare";

export async function action({ request, context }: ActionFunctionArgs) {
  const sessionStorage = pdxSession({ request, context });
  return redirect("/", {
    headers: {
      "Set-Cookie": await sessionStorage.destroy(),
    },
  });
}
