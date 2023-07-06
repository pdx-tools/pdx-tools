import React from "react";
import { AccountContent } from "./AccountContent";
import { useProfileQuery } from "@/services/appApi";

export const Account = () => {
  const profileQuery = useProfileQuery();

  if (profileQuery.data === undefined || profileQuery.data.kind == "guest") {
    return null;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-5">
      <div className="flex items-baseline space-x-4">
        <h1 className="text-4xl">Manage Your Account</h1>
        <span>(ID: {profileQuery.data.user.user_id})</span>
      </div>
      <AccountContent info={profileQuery.data.user} />
    </div>
  );
};
