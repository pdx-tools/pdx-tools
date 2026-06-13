import { WebPage } from "@/components/layout/WebPage";
import { LoggedIn } from "@/components/LoggedIn";
import { Account, LoginRequired } from "@/features/account";
import { useLoaderData } from "react-router";
import { pdxSession } from "@/server-lib/auth/session";
import { seo } from "@/lib/seo";
import type { Route } from "./+types/account";

export const meta = () =>
  seo({
    title: "Account Settings - PDX Tools",
    description: "Update PDX Tools account information",
  });

export const loader = async ({ request, context }: Route.LoaderArgs) => {
  const session = await pdxSession({ request, context }).get();
  return { session };
};

export default function AccountRoute() {
  const { session } = useLoaderData<typeof loader>();
  return (
    <WebPage>
      {session.kind === "user" ? (
        <LoggedIn session={session}>
          <Account />
        </LoggedIn>
      ) : (
        <LoginRequired title="Manage Your Account" />
      )}
    </WebPage>
  );
}
