import { fetchOk } from "@/lib/fetch";
import { getEnv } from "./env";
import { s3FetchOk, s3Keys } from "./s3";
import { log } from "./logging";
import sharp from "sharp";
import { timeit } from "@/lib/timeit";

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

  // Convert the png screenshot into lossless webp, which is
  // 40% of the size as the png at a cost of 100ms.
  const { data: buffer, elapsedMs } = await timeit(() =>
    sharp(pngBuffer.data).webp({ lossless: true }).toBuffer(),
  );

  log.info({
    key: saveId,
    msg: "transcoded into webp preview",
    elapsedMs: elapsedMs.toFixed(2),
    imageSize: buffer.byteLength,
  });

  // Make a copy, otherwise undici will throw an error:
  // ArrayBuffer: SharedArrayBuffer is not allowed
  const body = new Uint8Array(new ArrayBuffer(buffer.length));
  buffer.copy(body);

  const s3Upload = await timeit(() =>
    s3FetchOk(s3Key, {
      method: "PUT",
      body,
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
