import { AlertDescription, Alert } from "@/components/Alert";
import { PrivateUserInfo, useNewApiKeyRequest } from "@/services/appApi";
import { Button, Typography } from "antd";
import React, { useState } from "react";
const { Text } = Typography;

export const AccountContent = ({ info }: { info: PrivateUserInfo }) => {
  const [key, setKey] = useState<string | undefined>();
  const newKey = useNewApiKeyRequest(setKey);

  return (
    <>
      {key ? (
        <Alert key={key} variant="info" className="p-4">
          <AlertDescription>
            <Text copyable={{ text: key || "" }}>
              Your new API Key: <pre className="inline">{key}</pre>. Keep it
              safe
            </Text>
          </AlertDescription>
        </Alert>
      ) : null}
      <div>
        <p>
          Generate a new API key for 3rd party apps. Previous API key is
          overwritten
        </p>
        <Button loading={newKey.isLoading} onClick={() => newKey.mutate()}>
          Generate
        </Button>
      </div>
    </>
  );
};
