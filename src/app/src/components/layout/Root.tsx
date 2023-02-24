import React from "react";
import { SessionProvider } from "@/features/account";
import { UserMetricsScript } from "./UserMetricsScript";
import { ErrorCatcher } from "@/features/errors";

type RootProps = {
  children: React.ReactNode;
};

export const Root = ({ children }: RootProps) => {
  return (
    <SessionProvider>
      <UserMetricsScript />
      <ErrorCatcher>{children}</ErrorCatcher>
    </SessionProvider>
  );
};
