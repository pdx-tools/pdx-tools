import React from "react";
import { Alert, Typography } from "antd";
import Link from "next/link";
const { Text } = Typography;

interface RejectAlertProps {
  error: ErrorAction;
}

export type ErrorAction =
  | { type: "none" }
  | { type: "login-to-upload" }
  | { type: "already-uploaded"; saveId: string }
  | { type: "invalid-patch" }
  | { type: "internal-error"; msg: string }
  | { type: "empty-save-slots" }
  | { type: "remaining-save-slots"; remaining: number };

export const RejectAlert = ({ error }: RejectAlertProps) => {
  switch (error.type) {
    case "none":
      return null;
    case "already-uploaded":
      return (
        <Alert
          closable
          type="info"
          message={
            <Text
              copyable={{
                text: `${location.origin}/eu4/saves/${error.saveId}`,
              }}
            >
              {`This save appears to have aleady been uploaded here: `}
              <Link href={`/eu4/saves/${error.saveId}`}>Link to save</Link>
            </Text>
          }
        ></Alert>
      );
    case "login-to-upload":
      return <Alert closable type="info" message="Must log in to upload" />;
    case "invalid-patch":
      return <Alert closable type="info" message="Patch is not supported" />;
    case "empty-save-slots":
      return (
        <Alert
          closable
          type="info"
          message="No more save slots available. Please delete saves first before uploading."
        />
      );
    case "remaining-save-slots":
      return (
        <Alert
          closable
          type="info"
          message={`Upload is not a record breaking ironman save, so will use up one of the remaining ${error.remaining} save slots`}
        />
      );
    case "internal-error":
      return (
        <Alert
          closable
          type="error"
          message={`An internal PDX Tools error, please feel free to reach out via discord to report the following error: ${error.msg}`}
        />
      );
  }
};
