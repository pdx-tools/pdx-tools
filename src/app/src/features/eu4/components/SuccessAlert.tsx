import React from "react";
import { Alert, Typography } from "antd";
import Link from "next/link";
const { Text } = Typography;

interface SuccessAlertProps {
  newSaveId: string;
}

export const SuccessAlert = ({ newSaveId }: SuccessAlertProps) => {
  return (
    <Alert
      type="success"
      closable
      message={
        <Text
          copyable={{
            text: `${location.origin}/eu4/saves/${newSaveId}`,
          }}
        >
          {`Save successfully uploaded! `}
          <Link href={`/eu4/saves/${newSaveId}`}>
            <a>Permalink</a>
          </Link>
        </Text>
      }
    />
  );
};
