import React from "react";
import { HtmlHead } from "@/components/head";
import { Home } from "@/components/landing/Home";
import { RakalyStructure } from "@/components/layout";
import { FileDrop } from "@/features/engine/FileDrop";

export const LoadingPage: React.FC<{}> = () => {
  return (
    <>
      <style jsx>{`
        p {
          color: white;
        }
      `}</style>
      <HtmlHead>
        <title>Rakaly</title>
        <meta
          name="description"
          content="Rakaly is a home for EU4 save files to share with the world, compete in a casual leaderboard for achievement completion times, and to analyze with charts, tables, and maps"
        ></meta>
      </HtmlHead>
      <RakalyStructure>
        <FileDrop>
          <Home
            subtitle={
              <p>
                Please wait while your save is transferred to Rakaly. Not
                working? Ensure that pop-ups are allowed or click the button
                below to open Rakaly and manually select your save.
              </p>
            }
          />
        </FileDrop>
      </RakalyStructure>
    </>
  );
};

export default LoadingPage;
