import React from "react";
import { useRouter } from "next/router";
import { HtmlHead } from "@/components/head";
import { UserPage } from "@/features/account";
import { Root } from "@/components/layout/Root";
import { WebPage } from "@/components/layout";

export const UserSaves = () => {
  const router = useRouter();
  const { user_id } = router.query;
  return (
    <Root>
      <HtmlHead>
        <title>User saves - PDX Tools</title>
        <meta
          name="description"
          content={`EU4 Saves uploaded by user${user_id ? `: ${user_id}` : ""}`}
        ></meta>
      </HtmlHead>
      {typeof user_id === "string" && !Array.isArray(user_id) ? (
        <WebPage>
          <UserPage userId={user_id} />
        </WebPage>
      ) : null}
    </Root>
  );
};

export default UserSaves;
