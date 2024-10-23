import React from "react";
import { AccountContent } from "./AccountContent";
import { useLoggedIn } from "@/components/LoggedIn";

export const Account = () => {
  const user = useLoggedIn();
  return (
    <div className="mx-auto max-w-5xl space-y-5 p-5">
      <div className="flex items-baseline space-x-4">
        <h1 className="text-4xl">Manage Your Account</h1>
        <span>(ID: {user.userId})</span>
      </div>
      <AccountContent />
    </div>
  );
};
