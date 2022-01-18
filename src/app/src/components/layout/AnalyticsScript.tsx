import React from "react";
import Script from "next/script";

export const AnalyticsScript: React.FC<{}> = ({}) => {
  return (
    <Script data-domain="rakaly.com" src="https://a.rakaly.com/js/index.js" />
  );
};
