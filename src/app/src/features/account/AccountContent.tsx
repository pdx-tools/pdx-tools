import { Alert, Button, Descriptions, Typography } from "antd";
import React, { useState } from "react";
import { useSelector } from "react-redux";
import { rakalyApi } from "../../services/rakalyApi";
import { selectUserInfo } from "./sessionSlice";
const { Text } = Typography;

export const AccountContent: React.FC<{}> = () => {
  const userInfo = useSelector(selectUserInfo);
  const [key, setKey] = useState<string | undefined>();
  const [trigger, { isLoading }] = rakalyApi.endpoints.newApiKey.useMutation();

  if (!userInfo) {
    return null;
  }

  const generateApiClick = async () => {
    setKey((await trigger().unwrap()).api_key);
  };
  const message = (
    <Text copyable={{ text: key || "" }}>
      {`Your new API Key: ${key}. Keep it safe`}
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
        <Descriptions.Item label="Rakaly User Id">
          <Text copyable>{userInfo.user_id}</Text>
        </Descriptions.Item>
        <Descriptions.Item label="New API Key">
          <p>
            Generate a new API key for 3rd party apps. Previous API key is
            overwritten
          </p>
          <Button loading={isLoading} onClick={generateApiClick}>
            Generate
          </Button>
        </Descriptions.Item>
      </Descriptions>
    </>
  );
};
