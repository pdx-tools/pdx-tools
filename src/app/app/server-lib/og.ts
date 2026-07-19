import { log } from "./logging";
import { timeit } from "@/lib/timeit";
import { pdxMetrics } from "./metrics";
import type { PdxStorage } from "./storage";
import { pdxFns } from "./functions";
import { getCloudflare } from "./cloudflare-context";
import type { PdxRouteContext } from "./cloudflare-context";

export const pdxOg = ({ storage, context }: { storage: PdxStorage; context: PdxRouteContext }) => {
  const parseApiEndpoint = getCloudflare(context).env.PARSE_API_ENDPOINT;
  return {
    enabled: !!parseApiEndpoint,
    generateOgIntoStorage: async (saveId: string, saveData?: ArrayBuffer) => {
      const metrics = pdxMetrics(context);
      let data: ArrayBuffer;
      if (saveData) {
        data = saveData;
      } else {
        const object = await storage.saves.get(saveId);
        if (!object) {
          throw new Error(`save ${saveId} not found in storage`);
        }
        data = await object.arrayBuffer();
      }

      const result = await timeit(() =>
        pdxFns({
          endpoint: parseApiEndpoint,
        }).renderScreenshot(data),
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
