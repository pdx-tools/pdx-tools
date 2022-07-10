import { getSaveMeta } from "@/services/appApi";
import { proxy, transfer } from "comlink";
import { useCallback } from "react";
import { useDispatch } from "react-redux";
import { getWasmWorker, useWasmWorker } from "../worker/wasm-worker-context";
import { timeit } from "../worker/worker-lib";
import { AnalyzeSource } from "../worker/worker";
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
import { getErrorMessage } from "@/lib/getErrorMessage";
import { endCk3Analyze } from "@/features/ck3/ck3Slice";
import { endHoi4Analyze } from "@/features/hoi4/hoi4Slice";
import { endImperatorAnalyze } from "@/features/imperator/imperatorSlice";
import { emitEvent } from "@/lib/plausible";
import { useAppSelector } from "@/lib/store";
import { selectIsDeveloper } from "@/features/account";
import { check } from "@/lib/isPresent";
import { log } from "@/lib/log";
import { AnalyzeEvent } from "../worker/worker-types";
import { captureException } from "@/features/errors";

export type AnalyzeInput =
  | { kind: "local"; file: File }
  | { kind: "server"; saveId: string }
  | { kind: "skanderbeg"; skanId: string };

async function inputToSource(
  input: AnalyzeInput,
  onProgress: (evt: AnalyzeEvent) => void
): Promise<AnalyzeSource> {
  switch (input.kind) {
    case "local": {
      // Need to consume the file before passing it to the web worker
      // else we'll get a permission issue on android when a save on
      // google drive is selected
      var [bytes, elapsedMs] = await timeit(
        async () => new Uint8Array(await input.file.arrayBuffer())
      );

      onProgress({
        kind: "bytes read",
        amount: bytes.length,
        percent: 10,
        elapsedMs: elapsedMs,
      });

      return {
        kind: "local",
        name: input.file.name,
        data: new Uint8Array(bytes),
      };
    }
    default: {
      return {
        ...input,
        data: new Uint8Array(),
      };
    }
  }
}

export function useFilePublisher() {
  const wasmWorkerRef = useWasmWorker();
  const dispatch = useDispatch();
  const onProgress = useAnalyzeProgress();
  const eu4CanvasRef = useEu4CanvasRef();
  const isDeveloper = useAppSelector(selectIsDeveloper);

  return useCallback(
    async (input: AnalyzeInput) => {
      async function runEngineOverInput() {
        dispatch(startSaveAnalyze());
        const wasmWorker = getWasmWorker(wasmWorkerRef);
        let filename;

        switch (input.kind) {
          case "server": {
            filename = getSaveMeta(input.saveId).then((x) => {
              dispatch(setEu4ServerSaveFile(x));
              return x.filename;
            });
            break;
          }
          case "local": {
            filename = Promise.resolve(input.file.name);
            break;
          }
          case "skanderbeg": {
            filename = Promise.resolve("savegame.eu4");
            break;
          }
        }

        const source = await inputToSource(input, onProgress);
        const analysis = await wasmWorker.analyze(
          transfer(source, [source.data.buffer]),
          proxy({
            progress: onProgress,
          })
        );

        emitEvent({ kind: "parse", game: analysis.kind });
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

            let drawCount = 0;
            check(eu4Canvas.map).onDraw = (e) => {
              if (isDeveloper || drawCount == 0) {
                drawCount += 1;

                let cancellations = ``;
                if (
                  e.viewportAnimationRequestCancelled != 0 ||
                  e.mapAnimationRequestCancelled != 0
                ) {
                  cancellations += ` (cancellations: viewport ${e.viewportAnimationRequestCancelled} / redraw ${e.mapAnimationRequestCancelled})`;
                }
                log(
                  `canvas content redrawn in: ${e.elapsedMs.toFixed(
                    2
                  )}ms${cancellations}`
                );
              }
            };

            const [x, y] = await wasmWorker.eu4InitialMapPosition();

            if (input.kind !== "server") {
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
        console.error(ex);
        captureException(ex);
        dispatch(engineFailure(getErrorMessage(ex)));
      }
    },
    [wasmWorkerRef, dispatch, onProgress, eu4CanvasRef, isDeveloper]
  );
}
