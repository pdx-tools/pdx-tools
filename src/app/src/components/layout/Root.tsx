import React from "react";
import { SessionProvider } from "@/features/account";
import { ErrorCatcher } from "@/features/errors";
import { Tooltip } from "@/components/Tooltip";
import { Toaster } from "@/components/Toaster";

type RootProps = {
  children: React.ReactNode;
};

export const Root = ({ children }: RootProps) => {
  return (
    <Tooltip.Provider delayDuration={300}>
      <SessionProvider>
        <ErrorCatcher>
          {children}
          <Toaster />
        </ErrorCatcher>
      </SessionProvider>
    </Tooltip.Provider>
  );
};
