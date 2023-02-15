import { Alert } from "antd";
import React from "react";
import { useEu4Meta } from "../Eu4SaveProvider";

export const SaveWarnings = () => {
  const meta = useEu4Meta();

  if (meta.warnings.length == 0) {
    return null;
  }

  return (
    <Alert
      type="warning"
      message={
        <div>
          {meta.warnings.map((x) => (
            <div key={x}>{x}</div>
          ))}
        </div>
      }
      closable={true}
      className="fixed w-full"
    />
  );
};
