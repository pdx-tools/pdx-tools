import React, { useEffect } from "react";
import { HtmlHead } from "@/components/head";
import { Home } from "@/components/landing/Home";
import { AppStructure } from "@/components/layout";
import { FileDrop } from "@/features/engine/FileDrop";

export const LoadingPage = () => {
  useEffect(() => {
    history.replaceState({}, "", "/");
  }, []);

  return (
    <>
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
              <div className="text-lg mt-6 mx-auto text-center max-w-prose">
                Please wait while your save is transferred to PDX Tools. Not
                working? Ensure that pop-ups are allowed or manually select and
                drag and drop your save.
              </div>
            }
          />
        </FileDrop>
      </AppStructure>
    </>
  );
};

export default LoadingPage;
