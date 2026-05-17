import { log } from "./logging";
import { timeit } from "@/lib/timeit";
import type { pdxS3 } from "./s3";
import { pdxFns } from "./functions";
import type { AppLoadContext } from "react-router";

export const pdxOg = ({
  s3,
  context,
}: {
  s3: ReturnType<typeof pdxS3>;
  context: AppLoadContext;
}) => {
  const parseApiEndpoint = context.cloudflare.env.PARSE_API_ENDPOINT;
  return {
    enabled: !!parseApiEndpoint,
    generateOgIntoS3: async (saveId: string, saveData?: ArrayBuffer) => {
      const s3Key = s3.keys.preview(saveId);
      const data: ArrayBuffer =
        saveData ?? (await s3.fetchOk(s3.keys.save(saveId)).then((x) => x.arrayBuffer()));

      const result = await timeit(() =>
        pdxFns({
          endpoint: parseApiEndpoint,
        }).renderScreenshot(data),
      );

      const buffer = result.data;
      log.info({
        key: saveId,
        msg: "generated webp preview",
        elapsedMs: result.elapsedMs.toFixed(2),
        imageSize: buffer.byteLength,
      });

      const s3Upload = await timeit(() =>
        s3.fetchOk(s3Key, {
          method: "PUT",
          body: buffer,
          headers: {
            "Content-Type": "image/webp",
            "Content-Length": `${buffer.byteLength}`,
          },
        }),
      );

      log.info({
        key: saveId,
        msg: "stored preview in s3",
        elapsedMs: s3Upload.elapsedMs.toFixed(2),
      });
    },
  };
};
