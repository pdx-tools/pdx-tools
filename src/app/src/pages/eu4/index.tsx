import React from "react";
import { HtmlHead } from "@/components/head";
import { AppStructure } from "@/components/layout";
import { Eu4GamePage } from "@/features/eu4/Eu4GamePage";

export const Eu4Home: React.FC<{}> = () => {
  return (
    <>
      <HtmlHead>
        <title>EU4 - PDX Tools</title>
        <meta
          name="description"
          content="Find the latest, record breaking EU4 save files on this casual leaderboard"
        ></meta>
      </HtmlHead>
      <AppStructure>
        <Eu4GamePage />
      </AppStructure>
    </>
  );
};

export default Eu4Home;
