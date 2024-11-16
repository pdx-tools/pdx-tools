import { WebPage } from "@/components/layout/WebPage";
import { LoggedIn } from "@/components/LoggedIn";
import { Account } from "@/features/account";
import { useLoaderData } from "@remix-run/react";
import { LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { pdxSession } from "@/server-lib/auth/session";
import { seo } from "@/lib/seo";

export const meta: MetaFunction = () =>
  seo({
    title: "Account Settings - PDX Tools",
    description: "Update PDX Tools account information",
  });

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const session = await pdxSession({ request, context }).get();
  if (session.kind !== "user") {
    throw new Error("Not logged in");
  }
  return { session };
};

export default function AccountRoute() {
  const { session } = useLoaderData<typeof loader>();
  return (
    <WebPage>
      <LoggedIn session={session}>
        <Account />
      </LoggedIn>
    </WebPage>
  );
}
