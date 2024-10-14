import { useIsClient } from "@/hooks/useIsClient";
import React from "react";

export const Csr = ({ children }: React.PropsWithChildren<{}>) => {
  if (useIsClient()) {
    return <>{children}</>;
  } else {
    return null;
  }
};
