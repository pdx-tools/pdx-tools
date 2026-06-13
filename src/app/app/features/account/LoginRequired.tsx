import { useLocation } from "react-router";
import { SteamButton } from "@/components/layout/auth/SteamButton";

type LoginRequiredProps = {
  title?: string;
  message?: string;
};

export function LoginRequired({
  title = "Sign in required",
  message = "Sign in through Steam to view and manage your account.",
}: LoginRequiredProps) {
  const location = useLocation();
  const returnTo = `${location.pathname}${location.search}`;
  return (
    <div className="mx-auto max-w-5xl space-y-5 p-5">
      <h1 className="text-4xl">{title}</h1>
      <p>{message}</p>
      <p className="text-gray-600 dark:text-gray-400">
        New to PDX Tools? Signing in with Steam creates your account automatically.
      </p>
      <div className="flex">
        <SteamButton returnTo={returnTo} />
      </div>
    </div>
  );
}
