import React from "react";
import { useRouter } from "next/router";
import { HtmlHead } from "@/components/head";
import { UserPage } from "@/features/account";
import { AppStructure } from "@/components/layout/AppStructure";

export const UserSaves: React.FC<{}> = () => {
  const router = useRouter();
  const { user_id } = router.query;
  return (
    <>
      <HtmlHead>
        <title>User saves - PDX Tools</title>
        <meta
          name="description"
          content={`EU4 Saves uploaded by user${user_id ? `: ${user_id}` : ""}`}
        ></meta>
      </HtmlHead>
      <AppStructure>
        {typeof user_id === "string" && !Array.isArray(user_id) ? (
          <UserPage userId={user_id} />
        ) : null}
      </AppStructure>
    </>
  );
};

export default UserSaves;
