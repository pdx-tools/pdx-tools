import React from "react";
import { ErrorCatcher } from "@/features/errors";
import { Tooltip } from "@/components/Tooltip";
import { Toaster } from "@/components/Toaster";

type RootProps = {
  children: React.ReactNode;
};

export const Root = ({ children }: RootProps) => {
  return (
    <Tooltip.Provider delayDuration={300}>
        <ErrorCatcher>
          {children}
          <Toaster />
        </ErrorCatcher>
    </Tooltip.Provider>
  );
};
