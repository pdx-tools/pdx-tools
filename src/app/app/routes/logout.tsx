import { pdxSession } from "@/server-lib/auth/session";
import { redirect } from "react-router";
import type { Route } from "./+types/logout";

export async function action({ request, context }: Route.ActionArgs) {
  const sessionStorage = pdxSession({ request, context });
  return redirect("/", {
    headers: {
      "Set-Cookie": await sessionStorage.destroy(),
    },
  });
}
