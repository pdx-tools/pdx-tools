import React from "react";
import { ErrorCatcher, ErrorDisplay } from "@/features/errors";
import { Tooltip } from "@/components/Tooltip";
import { Toaster } from "@/components/Toaster";

type RootProps = {
  children: React.ReactNode;
};

export const Root = ({ children }: RootProps) => {
  return (
    <Tooltip.Provider delayDuration={300}>
      <ErrorCatcher
        fallback={(args) => (
          <ErrorDisplay
            {...args}
            className="m-8"
            title="An unexpected error occurred"
          />
        )}
      >
        {children}
        <Toaster />
      </ErrorCatcher>
    </Tooltip.Provider>
  );
};
