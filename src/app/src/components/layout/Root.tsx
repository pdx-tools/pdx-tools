import React from "react";
import { SessionProvider } from "@/features/account";
import { UserMetricsScript } from "./UserMetricsScript";
import { ErrorCatcher } from "@/features/errors";
import { Tooltip } from "@/components/Tooltip";

type RootProps = {
  children: React.ReactNode;
};

export const Root = ({ children }: RootProps) => {
  return (
    <Tooltip.Provider delayDuration={300}>
      <SessionProvider>
        <UserMetricsScript />
        <ErrorCatcher>{children}</ErrorCatcher>
      </SessionProvider>
    </Tooltip.Provider>
  );
};
