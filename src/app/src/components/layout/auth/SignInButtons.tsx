import React from "react";
import { Space } from "antd";
import { SteamLogin } from "./SteamLogin";
import { SteamRegister } from "./SteamRegister";

export const SignInButtons = () => {
  // The reason why login and register are different styled buttons:
  // https://uxmovement.com/buttons/why-sign-up-and-sign-in-button-labels-confuse-users/
  return (
    <Space>
      <SteamLogin />
      <SteamRegister />
    </Space>
  );
};
