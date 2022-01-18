import { expose, transfer } from "comlink";
import { fetchSkanSave } from "@/services/skanApi";
import { getSaveFile } from "@/services/rakalyApi";
import { detectType } from "./detect";
import { getRawData, setRawData } from "./storage";
import { timeit } from "./worker-lib";
import { AnalyzeOptions } from "./worker-types";
import { Achievements, EnhancedMeta } from "@/features/eu4/types/models";
import { DetectedDataType } from "../engineSlice";
import { getErrorMessage } from "@/lib/getErrorMessage";
import { Ck3Metadata, initializeCk3, Ck3Mod } from "./ck3";
import { Hoi4Metadata, Hoi4Mod, initializeHoi4 } from "./hoi4";
import { Eu4Mod, initializeEu4 } from "./eu4";
import {
  ImperatorMetadata,
  ImperatorMod,
  initializeImperator,
} from "./imperator";

export type AnalyzeSource =
  | { kind: "local"; file: File }
  | { kind: "rakaly"; saveId: string }
  | { kind: "skanderbeg"; skanId: string };

export type AnalyzeResponse =
  | { kind: "eu4"; meta: EnhancedMeta; achievements: Achievements }
  | { kind: "ck3"; meta: Ck3Metadata }
  | { kind: "hoi4"; meta: Hoi4Metadata }
  | { kind: "imperator"; meta: ImperatorMetadata };

function extensionType(filename: string): DetectedDataType | null {
  const splits = filename.split(".");
  const extension = splits[splits.length - 1];
  switch (extension) {
    case "rome":
      return "imperator";
    case "eu4":
    case "ck3":
    case "hoi4":
      return extension;
    default:
      return null;
  }
}

const obj = {
  ...Eu4Mod,
  ...Ck3Mod,
  ...Hoi4Mod,
  ...ImperatorMod,
  async analyze(
    source: AnalyzeSource,
    options?: AnalyzeOptions
  ): Promise<AnalyzeResponse> {
    switch (source.kind) {
      case "local": {
        var [bytes, elapsedMs] = await timeit(
          async () => new Uint8Array(await source.file.arrayBuffer())
        );

        options?.progress({
          kind: "bytes read",
          amount: bytes.length,
          percent: 10,
          elapsedMs: elapsedMs,
        });

        setRawData(bytes);

        const kind =
          extensionType(source.file.name) ?? (await detectType(bytes, options));
        switch (kind) {
          case "eu4": {
            const results = await initializeEu4(bytes, options);
            return { kind: "eu4", ...results };
          }
          case "ck3": {
            const { meta } = await initializeCk3(bytes, options);
            return { kind: "ck3", meta };
          }
          case "hoi4": {
            const { meta } = await initializeHoi4(bytes, options);
            return { kind: "hoi4", meta };
          }
          case "imperator": {
            const { meta } = await initializeImperator(bytes, options);
            return { kind: "imperator", meta };
          }
        }
      }

      case "rakaly": {
        const saveDataRequest = getSaveFile(
          source.saveId,
          undefined,
          (progress) => {
            options?.progress({
              kind: "progress",
              elapsedMs: 0,
              msg: "read data",
              percent: progress * 14,
            });
          }
        );

        const bytes = await saveDataRequest;
        setRawData(bytes);
        const results = await initializeEu4(bytes, options);
        return { kind: "eu4", ...results };
      }

      case "skanderbeg": {
        options?.progress({
          kind: "start poll",
          percent: 0,
          endPercent: 10,
          elapsedMs: 0,
        });

        try {
          var bytes = new Uint8Array(await fetchSkanSave(source.skanId));
        } catch (ex) {
          throw new Error(
            `Skanderbeg experienced an error: ${getErrorMessage(ex)}`
          );
        } finally {
          options?.progress({
            kind: "end poll",
            percent: 10,
            elapsedMs: 0,
          });
        }

        if (bytes.length == 0) {
          throw new Error(`Skanderbeg returned an empty save`);
        }

        setRawData(bytes);
        const results = await initializeEu4(bytes, options);
        return { kind: "eu4", ...results };
      }
    }
  },

  async getRawFileData() {
    const data = await getRawData();
    return transfer(data, [data.buffer]);
  },
};

expose(obj);
export type WasmWorker = typeof obj;
