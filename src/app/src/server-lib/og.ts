import { fetchOk } from "@/lib/fetch";
import { getEnv } from "./env";
import { s3FetchOk, s3Keys } from "./s3";
import { log } from "./logging";
import { timeit } from "@/lib/timeit";
import { convertScreenshot } from "./save-parser";

export async function generateOgIntoS3(saveId: string) {
  const url =
    process.env.NODE_ENV === "production"
      ? "https://pdx.tools"
      : "http://localhost:3001";

  const s3Key = s3Keys.preview(saveId);

  const puppeteerCmd = `async function ({ page }) {
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

  // An extremely roundabout string concatenation due to:
  // https://github.com/cloudflare/next-on-pages/issues/871
  const bust = await new Promise((res) => res("default"));
  const cmd = ["export", bust, puppeteerCmd].join(" ");

  const puppeteerUrl = new URL(getEnv("PUPPETEER_URL") + "/download");
  puppeteerUrl.searchParams.set("token", getEnv("PUPPETEER_TOKEN"));

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
  const { data: buffer, elapsedMs } = await timeit(() => convertScreenshot(pngBuffer.data));

  log.info({
    key: saveId,
    msg: "transcoded into webp preview",
    elapsedMs: elapsedMs.toFixed(2),
    imageSize: buffer.byteLength,
  });

  const s3Upload = await timeit(() =>
    s3FetchOk(s3Key, {
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
}
