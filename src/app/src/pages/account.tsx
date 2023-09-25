import React from "react";
import { HtmlHead } from "@/components/head";
import { Root, WebPage } from "@/components/layout";
import { Account } from "@/features/account";
import { LoggedIn } from "@/components/LoggedIn";

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
        <LoggedIn>
          <Account />
        </LoggedIn>
      </WebPage>
    </Root>
  );
};

export default AppAcount;
