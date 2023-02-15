import React from "react";
import { HtmlHead } from "@/components/head";
import { Root, WebPage } from "@/components/layout";
import { Account } from "@/features/account";

export const AppAcount = () => {
  return (
    <Root>
      <HtmlHead>
        <title>Account Settings - PDX Tools</title>
        <meta
          name="description"
          content="Update PDX Tools account information"
        ></meta>
      </HtmlHead>
      <WebPage>
        <Account />
      </WebPage>
    </Root>
  );
};

export default AppAcount;
