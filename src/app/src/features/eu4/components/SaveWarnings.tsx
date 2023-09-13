import React from "react";
import { useEu4Meta } from "../store";
import { Alert } from "@/components/Alert";

export const SaveWarnings = () => {
  const meta = useEu4Meta();

  if (meta.warnings.length == 0) {
    return null;
  }

  return (
    <div className="fixed left-0 top-0 w-full">
      <Alert variant="warning" className="w-full px-4 py-2">
        <Alert.Description>
          {meta.warnings.map((x) => (
            <div key={x}>{x}</div>
          ))}
        </Alert.Description>
      </Alert>
    </div>
  );
};
