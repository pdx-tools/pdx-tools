import { pdxSession } from "@/server-lib/auth/session";
import { type ActionFunctionArgs, redirect } from "@remix-run/cloudflare";

export async function action({ request, context }: ActionFunctionArgs) {
  const sessionStorage = pdxSession({ request, context });
  return redirect("/", {
    headers: {
      "Set-Cookie": await sessionStorage.destroy(),
    },
  });
}
