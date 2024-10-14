import { fetchOk } from "@/lib/fetch";
import { log } from "./logging";
import { timeit } from "@/lib/timeit";
import { pdxS3 } from "./s3";
import { AppLoadContext } from "@remix-run/server-runtime";
import { pdxFns } from "./functions";

export const pdxOg = ({
  s3,
  context,
}: {
  s3: ReturnType<typeof pdxS3>;
  context: AppLoadContext;
}) => {
  const token = context.cloudflare.env.PUPPETEER_TOKEN;
  const puppeteerUrlEnv = context.cloudflare.env.PUPPETEER_URL;
  return {
    enabled: token && puppeteerUrlEnv,
    generateOgIntoS3: async (saveId: string) => {
      const url = import.meta.env.PROD
        ? "https://pdx.tools"
        : "http://localhost:3001";

      const s3Key = s3.keys.preview(saveId);

      const cmd = `export default async function ({ page }) {
        page.setViewport({
          width: 1200 + 56,
          height: 630,
        });
  
        const pageUrl = "${url}/eu4/saves/${saveId}";
        await page.goto(pageUrl, {
          waitUntil: "load",
        });
  
        await page.waitForSelector('button[aria-label="take screenshot"]');
        await page.evaluate(() => window.pdxScreenshot());
      }
      `;

      const puppeteerUrl = new URL(puppeteerUrlEnv + "/download");
      log.info({ msg: "requesting og creation", puppeteerUrl, key: saveId });
      puppeteerUrl.searchParams.set("token", token);

      const pngBuffer = await timeit(() =>
        fetchOk(puppeteerUrl, {
          method: "POST",
          body: cmd,
          headers: {
            "Content-Type": "application/javascript",
          },
        }).then((x) => x.arrayBuffer()),
      );

      log.info({
        msg: "generated png preview",
        key: saveId,
        elapsedMs: pngBuffer.elapsedMs.toFixed(2),
        imageSize: pngBuffer.data.byteLength,
      });

      // An optimized webp of the screenshot can be 1/3 of the size. It may seem odd
      // to call out to the API service to do the conversion, but it makes sense:
      // - Puppeteer webp screenshot is not optimized
      // - Using "sharp" has dependency issues when for Wasm deployments (npm
      //   doesn't save what cpu runtime)
      // - The pure rust webp impl in "image" does not output well optimized
      //   lossless
      // - Using "webp" rust crate does support web-assembly:
      //   https://github.com/jaredforth/webp/issues/20
      const { data: buffer, elapsedMs } = await timeit(() =>
        pdxFns({ context }).convertScreenshot(pngBuffer.data),
      );

      log.info({
        key: saveId,
        msg: "transcoded into webp preview",
        elapsedMs: elapsedMs.toFixed(2),
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
