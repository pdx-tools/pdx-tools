import { pdxSession } from "@/server-lib/auth/session";
import { ActionFunctionArgs, redirect } from "react-router";

export async function action({ request, context }: ActionFunctionArgs) {
  const sessionStorage = pdxSession({ request, context });
  return redirect("/", {
    headers: {
      "Set-Cookie": await sessionStorage.destroy(),
    },
  });
}
