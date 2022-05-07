import { PageHeader } from "antd";
import React from "react";
import { AccountContent } from "./AccountContent";

export const Account = () => {
  return (
    <PageHeader
      title="Manage Your Account"
      style={{ maxWidth: "1000px", margin: "0 auto" }}
      footer={<AccountContent />}
    />
  );
};
