import { useAppSession } from "@/server-lib/auth/session";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/start";

const logoutFn = createServerFn("POST", async () => {
  const session = await useAppSession();

  session.clear();

  throw redirect({
    href: "/",
  });
});

export const Route = createFileRoute("/logout")({
  preload: false,
  loader: () => logoutFn(),
});
