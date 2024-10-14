import Head from "next/head";
import React from "react";
import { useRouter } from "next/router";
import apple_url from "./apple-touch-icon.png";
import fav32 from "./favicon-32x32.png";
import fav16 from "./favicon-16x16.png";
import social from "../landing/social.png";

interface HtmlHeadProps {
  children: React.ReactNode;
  social?: string;
}

export const HtmlHead = ({
  children,
  social: socialImage = `https://pdx.tools${social}`,
}: HtmlHeadProps) => {
  const router = useRouter();
  const canonicalUrl = `https://pdx.tools${router.asPath}`;
  return (
    <Head>
      <meta
        name="viewport"
        content="width=device-width, initial-scale=1"
      ></meta>
      <meta name="color-scheme" content="light dark"></meta>
      <link rel="apple-touch-icon" sizes="180x180" href={apple_url} />
      <link rel="icon" type="image/png" sizes="32x32" href={fav32} />
      <link rel="icon" type="image/png" sizes="16x16" href={fav16} />
      <link rel="canonical" href={canonicalUrl} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta property="og:image" content={socialImage} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      {children}
    </Head>
  );
};
