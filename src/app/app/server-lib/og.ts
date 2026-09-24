import { log } from "./logging";
import { timeit } from "@/lib/timeit";
import { pdxMetrics } from "./metrics";
import type { PdxStorage } from "./storage";
import { parseApiFromEnv, pdxFns } from "./functions";
import { getCloudflare } from "./cloudflare-context";
import type { PdxRouteContext } from "./cloudflare-context";

export const pdxOg = ({
  storage,
  context,
  game = "eu4",
}: {
  storage: PdxStorage;
  context: PdxRouteContext;
  game?: "eu4" | "eu5";
}) => {
  const parseApi = parseApiFromEnv(getCloudflare(context).env);
  return {
    enabled: !!parseApi.endpoint,
    // Without `saveData`, the save is streamed out of storage so that the
    // Worker does not hold it in memory.
    generateOgIntoStorage: async (saveId: string, saveData?: ArrayBuffer) => {
      const metrics = pdxMetrics(context);
      let data: BodyInit;
      if (saveData) {
        data = saveData;
      } else {
        const object = await storage.saves.get(saveId);
        if (!object) {
          throw new Error(`save ${saveId} not found in storage`);
        }
        data = object.body;
      }

      const renderer = pdxFns(parseApi);
      const result = await timeit(() =>
        game === "eu5" ? renderer.renderEu5Screenshot(data) : renderer.renderScreenshot(data),
      ).catch((err) => {
        metrics.record({
          domain: "parse_api",
          operation: "render_screenshot",
          outcome: "error",
          status: "error",
          elapsedMs: 0,
        });
        throw err;
      });

      const buffer = result.data;
      metrics.record({
        domain: "parse_api",
        operation: "render_screenshot",
        outcome: "success",
        status: 200,
        elapsedMs: result.elapsedMs,
        bytes: buffer.byteLength,
      });
      log.info({
        key: saveId,
        msg: "generated webp preview",
        elapsedMs: result.elapsedMs.toFixed(2),
        imageSize: buffer.byteLength,
      });

      const upload = await timeit(() =>
        storage.previews.put(saveId, buffer, {
          httpMetadata: {
            contentType: "image/webp",
            cacheControl: "public, max-age=86400",
          },
        }),
      ).catch((err) => {
        metrics.record({
          domain: "og",
          operation: "og_put",
          outcome: "error",
          status: "error",
          elapsedMs: 0,
          bytes: buffer.byteLength,
        });
        throw err;
      });

      metrics.record({
        domain: "og",
        operation: "og_put",
        outcome: "success",
        status: 200,
        elapsedMs: upload.elapsedMs,
        bytes: buffer.byteLength,
      });
      log.info({
        key: saveId,
        msg: "stored preview in media bucket",
        elapsedMs: upload.elapsedMs.toFixed(2),
      });
    },
  };
};
