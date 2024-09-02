import { fetchOk } from "@/lib/fetch";
import { getEnv } from "./env";
import { s3FetchOk } from "./s3";

export async function generateOgIntoS3(saveId: string, s3Key: string) {
  const puppeteerCmd = `
    export default async function ({ page }) {
      page.setViewport({
        width: 1405,
        height: 640,
      });

      const pageUrl = "https://pdx.tools/eu4/saves/${saveId}";
      await page.goto(pageUrl, {
        waitUntil: "load",
      });

      // Wait for any button to show up on the UI
      await page.waitForSelector("button[data-state='closed']");
  
      // Dismiss alert about unsupported webgl
      await page.click("[role='alert'] button");
  
      // Take a screenshot
      const image = await page.screenshot({
        clip: {
          width: 1200.0,
          height: 630.0,
          x: 130,
          y: 0,
        },
      });

      return image;
    }
    `;

  const puppeteerUrl = new URL(getEnv("PUPPETEER_URL") + "/function");
  puppeteerUrl.searchParams.set("token", getEnv("PUPPETEER_TOKEN"));

  const imageResp = await fetchOk(puppeteerUrl, {
    method: "POST",
    body: puppeteerCmd,
    headers: {
      "Content-Type": "application/javascript",
    },
  });

  const image = await imageResp.blob();
  const headers = { "Content-Type": "image/png" };
  await s3FetchOk(s3Key, {
    method: "PUT",
    body: image,
    headers: {
      ...headers,
      "Content-Length": `${image.size}`,
    },
  });

  return new Response(image, { headers });
}
