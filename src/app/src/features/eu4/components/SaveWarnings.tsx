import React from "react";
import { useEu4Meta } from "../store";
import { Alert, AlertDescription } from "@/components/Alert";

export const SaveWarnings = () => {
  const meta = useEu4Meta();

  if (meta.warnings.length == 0) {
    return null;
  }

  return (
    <Alert variant="warning" className="fixed w-full px-4 py-2">
      <AlertDescription>
        {meta.warnings.map((x) => (
          <div key={x}>{x}</div>
        ))}
      </AlertDescription>
    </Alert>
  );
};
