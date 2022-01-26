import Head from "next/head";
import React from "react";
import apple_url from "./apple-touch-icon.png";
import fav32 from "./favicon-32x32.png";
import fav16 from "./favicon-16x16.png";
import social from "../landing/social.png";

export const HtmlHead: React.FC<{}> = ({ children }) => {
  return (
    <Head>
      <meta
        name="viewport"
        content="width=device-width, initial-scale=1"
      ></meta>
      <link rel="apple-touch-icon" sizes="180x180" href={apple_url} />
      <link rel="icon" type="image/png" sizes="32x32" href={fav32} />
      <link rel="icon" type="image/png" sizes="16x16" href={fav16} />
      <meta property="og:image" content={`https://pdx.tools${social}`} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      {children}
    </Head>
  );
};
