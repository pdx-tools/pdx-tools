import { useRouter } from "next/router";
import React from "react";
import { HtmlHead } from "@/components/head";
import { Root } from "@/components/layout";
import { SavePage } from "@/features/eu4/SavePage";

export const Eu4Save = () => {
  const router = useRouter();
  const { save_id } = router.query;

  if (typeof save_id != "string" || Array.isArray(save_id)) {
    return null;
  }

  const addr = process.env.NEXT_PUBLIC_EXTERNAL_ADDRESS;
  const social = addr ? `${addr}/api/saves/${save_id}/og` : undefined;
  return (
    <Root>
      <HtmlHead social={social}>
        <title>Loading Save: {save_id} - EU4 - PDX Tools</title>
      </HtmlHead>
      <SavePage saveId={save_id} />
    </Root>
  );
};

export default Eu4Save;
