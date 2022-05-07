import React from "react";
import Script from "next/script";

export const UserMetricsScript = ({}: {}) => {
  return (
    <Script data-domain="pdx.tools" src="https://a.pdx.tools/js/index.js" />
  );
};
