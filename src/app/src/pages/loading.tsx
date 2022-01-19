import React from "react";
import { HtmlHead } from "@/components/head";
import { Home } from "@/components/landing/Home";
import { AppStructure } from "@/components/layout";
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
        <title>PDX Tools</title>
        <meta
          name="description"
          content="PDX Tools is a home for EU4 save files to share with the world, compete in a casual leaderboard for achievement completion times, and to analyze with charts, tables, and maps"
        ></meta>
      </HtmlHead>
      <AppStructure>
        <FileDrop>
          <Home
            subtitle={
              <p>
                Please wait while your save is transferred to PDX Tools. Not
                working? Ensure that pop-ups are allowed or click the button
                below to open PDX Tools and manually select your save.
              </p>
            }
          />
        </FileDrop>
      </AppStructure>
    </>
  );
};

export default LoadingPage;
