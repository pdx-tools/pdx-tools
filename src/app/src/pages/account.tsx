import React from "react";
import { HtmlHead } from "@/components/head";
import { RakalyStructure } from "@/components/layout";
import { Account } from "@/features/account";

export const RakalyAccount: React.FC<{}> = () => {
  return (
    <>
      <HtmlHead>
        <title>Account Settings - Rakaly</title>
        <meta
          name="description"
          content="Update Rakaly account information"
        ></meta>
      </HtmlHead>
      <RakalyStructure>
        <Account />
      </RakalyStructure>
    </>
  );
};

export default RakalyAccount;
