import React from "react";
import { useRouter } from "next/router";
import { SkanderbegSavePage } from "@/features/skanderbeg";
import { HtmlHead } from "@/components/head";
import { Root } from "@/components/layout";

export const SkanderbegSave = () => {
  const router = useRouter();
  const { skan_id } = router.query;
  return (
    <Root>
      <HtmlHead>
        <title>{`PDX Tools | Skanderbeg Save`}</title>
        <meta
          name="description"
          content="Analyze EU4 save file that have been uploaded to Skanderbeg"
        ></meta>
      </HtmlHead>
      {typeof skan_id === "string" && !Array.isArray(skan_id) ? (
        <SkanderbegSavePage skanId={skan_id} />
      ) : null}
    </Root>
  );
};

export default SkanderbegSave;
