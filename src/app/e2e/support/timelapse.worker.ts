import { TimelapseEncoder } from "@pdx.tools/timelapse/encoder";
import { layoutTimelapseFrame } from "@pdx.tools/timelapse";

self.addEventListener("message", async () => {
  let encoder: TimelapseEncoder | undefined;
  try {
    const output = { width: 1280, height: 720 };
    const layout = layoutTimelapseFrame({
      framing: "world",
      viewport: { x: 0, y: 0, width: 200, height: 100 },
      world: { width: 200, height: 100 },
      output,
    });
    encoder = await TimelapseEncoder.create({
      layout,
      output,
      colors: { panel: "black", line: "white", year: "white", month: "white" },
      fonts: { family: "monospace", stack: "monospace", faces: [] },
    });
    const surface = new OffscreenCanvas(layout.band.width, layout.band.height);
    const ctx = surface.getContext("2d")!;
    ctx.fillStyle = "red";
    ctx.fillRect(0, 0, surface.width, surface.height);
    await encoder.addFrame(surface, { year: 1337, month: 4, day: 1 }, 30);
    ctx.fillStyle = "blue";
    ctx.fillRect(0, 0, surface.width, surface.height);
    await encoder.addFrame(surface, { year: 1338, month: 4, day: 1 }, 30);
    const blob = await encoder.finish();
    self.postMessage({ blob });
  } catch (error) {
    await encoder?.abort();
    self.postMessage({ error: String(error) });
  }
});
