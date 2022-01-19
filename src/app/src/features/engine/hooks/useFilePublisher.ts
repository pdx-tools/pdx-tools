import { getSaveMeta } from "@/services/appApi";
import { proxy } from "comlink";
import { useCallback } from "react";
import { useDispatch } from "react-redux";
import { getWasmWorker, useWasmWorker } from "../worker/wasm-worker-context";
import { AnalyzeSource } from "../worker/worker";
import { timeit } from "../worker/worker-lib";
import { startSaveAnalyze } from "../engineSlice";
import { getEu4Canvas, useEu4CanvasRef } from "../persistant-canvas-context";
import { useAnalyzeProgress } from "./useAnalyzeProgress";
import {
  endEu4Analyze,
  initialEu4CountryFilter,
  setEu4ServerSaveFile,
} from "@/features/eu4/eu4Slice";
import { MapPayload } from "@/features/eu4/types/map";
import { engineFailure, moduleLoaded } from "..";
import { captureException } from "@sentry/nextjs";
import { getErrorMessage } from "@/lib/getErrorMessage";
import { endCk3Analyze } from "@/features/ck3/ck3Slice";
import { endHoi4Analyze } from "@/features/hoi4/hoi4Slice";
import { endImperatorAnalyze } from "@/features/imperator/imperatorSlice";

export function useFilePublisher() {
  const wasmWorkerRef = useWasmWorker();
  const dispatch = useDispatch();
  const onProgress = useAnalyzeProgress();
  const eu4CanvasRef = useEu4CanvasRef();

  return useCallback(
    async (source: AnalyzeSource) => {
      async function runEngineOverInput() {
        dispatch(startSaveAnalyze());
        const wasmWorker = getWasmWorker(wasmWorkerRef);
        let filename;

        switch (source.kind) {
          case "server": {
            filename = getSaveMeta(source.saveId).then((x) => {
              dispatch(setEu4ServerSaveFile(x));
              return x.filename;
            });
            break;
          }
          case "local": {
            filename = Promise.resolve(source.file.name);
            break;
          }
          case "skanderbeg": {
            filename = Promise.resolve("savegame.eu4");
            break;
          }
        }

        const analysis = await wasmWorker.analyze(
          source,
          proxy({
            progress: onProgress,
          })
        );

        switch (analysis.kind) {
          case "eu4": {
            const meta = analysis.meta;
            const eu4Canvas = getEu4Canvas(eu4CanvasRef);
            const countries = await wasmWorker.eu4GetCountries();
            const defaultTag = await wasmWorker.eu4DefaultSelectedTag();

            const isNewMap = await eu4Canvas.initializeAssetsFromVersion(
              meta.savegame_version,
              onProgress
            );

            if (isNewMap) {
              const provinceIdToColorIndex =
                await eu4Canvas.provinceIdToColorIndex();
              await wasmWorker.eu4SetProvinceIdToColorIndex(
                provinceIdToColorIndex
              );
            }

            // reset the map mode to calculate country borders
            const politicalPayload: MapPayload = {
              kind: "political",
              paintSubjectInOverlordHue: false,
              tagFilter: initialEu4CountryFilter,
              showSecondaryColor: false,
              date: null,
            };

            var [provinceCountryColors, elapsedMs] = await timeit(() =>
              wasmWorker.eu4MapColors(politicalPayload)
            );

            onProgress({
              kind: "incremental progress",
              msg: "initial setup calculations",
              percent: 5,
              elapsedMs: elapsedMs,
            });

            if (isNewMap) {
              var [_, elapsedMs] = await timeit(() =>
                eu4Canvas.setupRenderer(provinceCountryColors[0])
              );

              onProgress({
                kind: "progress",
                percent: 100,
                msg: "setup map renderer",
                elapsedMs,
              });
            } else {
              eu4Canvas.map?.updateCountryProvinceColors(
                provinceCountryColors[0]
              );

              onProgress({
                kind: "progress",
                percent: 100,
                msg: "setup map renderer",
                elapsedMs: 0,
              });
            }

            const [x, y] = await wasmWorker.eu4InitialMapPosition();

            if (source.kind !== "server") {
              dispatch(setEu4ServerSaveFile(undefined));
            }

            const name = await filename;

            dispatch(
              moduleLoaded({
                filename: name,
                isImmersive: true,
                game: analysis.kind,
              })
            );

            dispatch(
              endEu4Analyze({
                date: meta.date,
                defaultSelectedCountry: defaultTag,
                meta,
                achievements: analysis.achievements,
                countries,
                mapPosition: [x, y],
              })
            );
            break;
          }

          case "ck3": {
            const meta = analysis.meta;
            const name = await filename;

            dispatch(
              endCk3Analyze({
                meta,
              })
            );

            dispatch(
              moduleLoaded({
                filename: name,
                isImmersive: false,
                game: analysis.kind,
              })
            );

            break;
          }

          case "hoi4": {
            const meta = analysis.meta;
            const name = await filename;

            dispatch(
              endHoi4Analyze({
                meta,
              })
            );

            dispatch(
              moduleLoaded({
                filename: name,
                isImmersive: false,
                game: analysis.kind,
              })
            );

            break;
          }

          case "imperator": {
            const meta = analysis.meta;
            const name = await filename;

            dispatch(
              endImperatorAnalyze({
                meta,
              })
            );

            dispatch(
              moduleLoaded({
                filename: name,
                isImmersive: false,
                game: analysis.kind,
              })
            );

            break;
          }
        }
      }

      try {
        await runEngineOverInput();
      } catch (ex) {
        captureException(ex);
        dispatch(engineFailure(getErrorMessage(ex)));
      }
    },
    [wasmWorkerRef, dispatch, onProgress, eu4CanvasRef]
  );
}
