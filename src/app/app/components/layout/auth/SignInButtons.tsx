import React from "react";
import { SteamLogin } from "./SteamLogin";
import { SteamRegister } from "./SteamRegister";

export const SignInButtons = () => {
  // The reason why login and register are different styled buttons:
  // https://uxmovement.com/buttons/why-sign-up-and-sign-in-button-labels-confuse-users/
  return (
    <div className="flex space-x-2">
      <SteamLogin />
      <div className="hidden sm:block">
        <SteamRegister />
      </div>
    </div>
  );
};
