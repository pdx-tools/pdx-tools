import { expose, transfer } from "comlink";
import { fetchSkanSave } from "@/services/skanApi";
import { getSaveFile } from "@/services/appApi";
import { getRawData, setRawData } from "./storage";
import { AnalyzeOptions } from "./worker-types";
import { Meta } from "@/features/eu4/types/models";
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
import { initializeVic3, Vic3Metadata, Vic3Mod } from "./vic3";

export type AnalyzeSource =
  | { kind: "local"; data: Uint8Array; name: string }
  | { kind: "server"; saveId: string; data: Uint8Array }
  | { kind: "skanderbeg"; skanId: string; data: Uint8Array };

export type AnalyzeResponse =
  | { kind: "eu4"; meta: Meta; version: string }
  | { kind: "ck3"; meta: Ck3Metadata }
  | { kind: "hoi4"; meta: Hoi4Metadata }
  | { kind: "imperator"; meta: ImperatorMetadata }
  | { kind: "vic3"; meta: Vic3Metadata };

function extensionType(filename: string): DetectedDataType {
  const splits = filename.split(".");
  const extension = splits[splits.length - 1];
  switch (extension) {
    case "rome":
      return "imperator";
    case "eu4":
    case "ck3":
    case "hoi4":
      return extension;
    case "v3":
      return "vic3";
    default:
      return "eu4";
  }
}

const obj = {
  ...Eu4Mod,
  ...Ck3Mod,
  ...Hoi4Mod,
  ...ImperatorMod,
  ...Vic3Mod,
  async analyze(
    source: AnalyzeSource,
    options?: AnalyzeOptions
  ): Promise<AnalyzeResponse> {
    switch (source.kind) {
      case "local": {
        const bytes = source.data;
        setRawData(bytes);

        const kind = extensionType(source.name);
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
          case "vic3": {
            const { meta } = await initializeVic3(bytes, options);
            return { kind: "vic3", meta };
          }
        }
      }

      case "server": {
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
