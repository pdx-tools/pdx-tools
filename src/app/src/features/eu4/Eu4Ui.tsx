import { useSelector } from "react-redux";
import {
  resetSaveAnalysis,
  selectAnalyzeFileName,
  selectShowCanvas,
} from "@/features/engine";
import { useMap } from "./hooks/useMap";
import { useEffect } from "react";
import { useAppDispatch } from "@/lib/store";
import { toggleShowTerrain, useEu4Meta } from "./eu4Slice";
import { Eu4CanvasOverlay } from "./Eu4CanvasOverlay";
import { useRouter } from "next/router";
import Head from "next/head";

export const Eu4Ui: React.FC<{}> = () => {
  const showCanvas = useSelector(selectShowCanvas);
  const dispatch = useAppDispatch();
  useMap();

  useEffect(() => {
    const showTerrain = JSON.parse(
      localStorage.getItem("map-show-terrain") ?? "false"
    );
    dispatch(toggleShowTerrain(showTerrain));
  }, [dispatch]);

  const filename = useSelector(selectAnalyzeFileName);
  const meta = useEu4Meta();

  return (
    <>
      <Head>
        <title>{`${filename.replace(".eu4", "")} (${meta.date}) - EU4 (${
          meta.savegame_version.first
        }.${meta.savegame_version.second}.${
          meta.savegame_version.third
        }) - Rakaly`}</title>
      </Head>
      {showCanvas && <Eu4CanvasOverlay />}
    </>
  );
};

export default Eu4Ui;
