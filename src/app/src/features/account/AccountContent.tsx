import { useNewApiKeyRequest, useProfileQuery } from "@/services/appApi";
import { Alert, Button, Descriptions, Typography } from "antd";
import React, { useState } from "react";
const { Text } = Typography;

export const AccountContent = () => {
  const profileQuery = useProfileQuery();
  const [key, setKey] = useState<string | undefined>();
  const newKey = useNewApiKeyRequest(setKey);

  if (profileQuery.data === undefined || profileQuery.data.kind == "guest") {
    return null;
  }

  const message = (
    <Text copyable={{ text: key || "" }}>
      Your new API Key: <pre className="inline">{key}</pre>. Keep it safe
    </Text>
  );
  const alert = key ? <Alert type="info" closable message={message} /> : null;

  return (
    <>
      {alert}
      <Descriptions
        bordered
        column={{ xxl: 1, xl: 1, lg: 1, md: 1, sm: 1, xs: 1 }}
      >
        <Descriptions.Item label="PDX Tools User Id">
          <Text copyable>{profileQuery.data.user.user_id}</Text>
        </Descriptions.Item>
        <Descriptions.Item label="New API Key">
          <p>
            Generate a new API key for 3rd party apps. Previous API key is
            overwritten
          </p>
          <Button loading={newKey.isLoading} onClick={() => newKey.mutate()}>
            Generate
          </Button>
        </Descriptions.Item>
      </Descriptions>
    </>
  );
};
