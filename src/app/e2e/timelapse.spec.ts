import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";
import { build } from "vite";

let workerSource: string;

test.beforeAll(async () => {
  // Bundle the real encoder without the app, game assets, or save parser.
  const result = await build({
    configFile: false,
    logLevel: "silent",
    build: {
      write: false,
      minify: false,
      lib: {
        entry: fileURLToPath(new URL("./support/timelapse.worker.ts", import.meta.url)),
        formats: ["iife"],
        name: "TimelapseTest",
      },
    },
  });
  const outputs = Array.isArray(result) ? result : [result];
  const script = outputs
    .flatMap((output) => ("output" in output ? output.output : []))
    .find((output) => output.type === "chunk");
  if (!script) throw Error("The encoder test bundle has no script");
  workerSource = script.code;
});

test("a worker encodes held frames into a video with the correct duration and pictures", async ({
  page,
}) => {
  await page.route("https://timelapse.test/", (route) =>
    route.fulfill({ contentType: "text/html", body: "<!doctype html><html><body></body></html>" }),
  );
  await page.goto("https://timelapse.test/");
  const result = await page.evaluate(async (source) => {
    const workerUrl = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
    const worker = new Worker(workerUrl);
    const blob = await new Promise<Blob>((resolve, reject) => {
      worker.onmessage = ({ data }: MessageEvent<{ blob: Blob; error?: string }>) => {
        if (data.error) reject(Error(data.error));
        else resolve(data.blob);
      };
      worker.onerror = (event) => reject(Error(event.message));
      worker.postMessage(null);
    }).finally(() => {
      worker.terminate();
      URL.revokeObjectURL(workerUrl);
    });

    const video = document.createElement("video");
    const url = URL.createObjectURL(blob);
    const waitFor = (event: string) =>
      new Promise<void>((resolve, reject) => {
        const failed = () => reject(Error(video.error?.message ?? "Video decode failed"));
        video.addEventListener("error", failed, { once: true });
        video.addEventListener(
          event,
          () => {
            video.removeEventListener("error", failed);
            resolve();
          },
          { once: true },
        );
      });
    try {
      const ready = waitFor("loadeddata");
      video.src = url;
      await ready;
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d")!;
      const pixels: number[][] = [];
      for (const time of [1 / 60, 59 / 60, 61 / 60, 119 / 60]) {
        const sought = waitFor("seeked");
        video.currentTime = time;
        await sought;
        ctx.drawImage(video, 0, 0);
        pixels.push(Array.from(ctx.getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data));
      }
      return {
        duration: video.duration,
        width: video.videoWidth,
        height: video.videoHeight,
        pixels,
      };
    } finally {
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
    }
  }, workerSource);

  expect(result.width).toBe(1280);
  expect(result.height).toBe(720);
  expect(result.duration).toBeCloseTo(2, 2);
  for (const red of result.pixels.slice(0, 2)) {
    expect(red[0]).toBeGreaterThan(200);
    expect(red[2]).toBeLessThan(50);
  }
  for (const blue of result.pixels.slice(2)) {
    expect(blue[2]).toBeGreaterThan(200);
    expect(blue[0]).toBeLessThan(50);
  }
});
