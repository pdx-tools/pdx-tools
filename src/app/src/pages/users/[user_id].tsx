import React from "react";
import { useRouter } from "next/router";
import { HtmlHead } from "@/components/head";
import { UserPage } from "@/features/account";
import { RakalyStructure } from "@/components/layout/RakalyStructure";

export const UserSaves: React.FC<{}> = () => {
  const router = useRouter();
  const { user_id } = router.query;
  return (
    <>
      <HtmlHead>
        <title>User saves - Rakaly</title>
        <meta
          name="description"
          content={`EU4 Saves uploaded by user${user_id ? `: ${user_id}` : ""}`}
        ></meta>
      </HtmlHead>
      <RakalyStructure>
        {typeof user_id === "string" && !Array.isArray(user_id) ? (
          <UserPage userId={user_id} />
        ) : null}
      </RakalyStructure>
    </>
  );
};

export default UserSaves;
