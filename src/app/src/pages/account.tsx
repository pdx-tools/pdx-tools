import React from "react";
import { HtmlHead } from "@/components/head";
import { AppStructure } from "@/components/layout";
import { Account } from "@/features/account";

export const AppAcount: React.FC<{}> = () => {
  return (
    <>
      <HtmlHead>
        <title>Account Settings - PDX Tools</title>
        <meta
          name="description"
          content="Update PDX Tools account information"
        ></meta>
      </HtmlHead>
      <AppStructure>
        <Account />
      </AppStructure>
    </>
  );
};

export default AppAcount;
