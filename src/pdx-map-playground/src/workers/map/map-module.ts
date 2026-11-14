import init, { PdxCanvasSurface, PdxMapImage, PdxMapRenderer } from "../wasm/wasm_pdx_map";
import type { CanvasDisplay } from "../wasm/wasm_pdx_map";
import wasmPath from "../wasm/wasm_pdx_map_bg.wasm?url";
import { proxy } from "comlink";

const initialized = (async () => {
  await init({ module_or_path: wasmPath });
})();

let appResolve: (value: PdxMapRenderer | PromiseLike<PdxMapRenderer>) => void;
let appReject: (reason?: any) => void;
let appTask = new Promise<PdxMapRenderer>((res, rej) => {
  appResolve = res;
  appReject = rej;
});

const pressedKeys = new Set<string>();

// Process uploaded map image into textures
async function processMapImage(imageFile: File): Promise<{ image: PdxMapImage }> {
  // Create image bitmap
  const imageBitmap = await createImageBitmap(imageFile);
  const canvas = new OffscreenCanvas(imageBitmap.width, imageBitmap.height);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(imageBitmap, 0, 0);
  const pixels = ctx.getImageData(0, 0, imageBitmap.width, imageBitmap.height);

  return {
    image: PdxMapImage.from_rgba(
      Uint8Array.from(pixels.data),
      imageBitmap.width,
      imageBitmap.height,
    ),
  };
}

export interface LocationLookupResult {
  locationIdx: number;
  locationId: number;
}

export const createMapEngine = async ({
  canvas,
  display,
  mapImageFile,
}: {
  canvas: OffscreenCanvas;
  display: CanvasDisplay;
  mapImageFile: File;
}) => {
  console.log("Starting map engine creation...");
  await initialized;
  console.log("WASM initialized");

  // Initialize canvas surface
  const canvasInit = await PdxCanvasSurface.init(canvas, display);
  console.log("Canvas initialized");

  // Process the uploaded map image and upload textures
  console.log("Processing map image...");
  const { image: indexedImage } = await processMapImage(mapImageFile);

  // Upload textures with their dimensions
  const westView = canvasInit.upload_west_texture(indexedImage);
  console.log("West texture uploaded");

  const eastView = canvasInit.upload_east_texture(indexedImage);
  console.log("East texture uploaded");

  try {
    console.log("Creating map renderer...");
    const app = PdxMapRenderer.create(canvasInit, indexedImage, westView, eastView, display);
    console.log("Map renderer created");

    appResolve(app);
  } catch (e) {
    console.error("Error creating map renderer:", e);
    appReject(e);
    throw e;
  }

  const app = await appTask;
  app.render();

  const rafTick = () => {
    app.tick();
    app.render();
    requestAnimationFrame(rafTick);
  };
  rafTick();

  console.log("Returning proxied map engine functions");
  return proxy({
    resize: async (width: number, height: number, scaleFactor: number) => {
      const gl = canvas.getContext("webgpu")!;
      gl.canvas.height = height;
      gl.canvas.width = width;
      app.resize(width, height, scaleFactor);
      app.render();
    },

    get_zoom: () => {
      return app.get_zoom();
    },

    onCursorMove: async (x: number, y: number) => {
      app.on_cursor_move(x, y);
      app.render();
    },

    onMouseButton: async (button: number, pressed: boolean) => {
      app.on_mouse_button(button, pressed);
      app.render();
    },

    onScroll: async (scrollLines: number) => {
      app.on_scroll(scrollLines);
      app.render();
    },

    onKeyDown: async (code: string) => {
      pressedKeys.add(code);
      app.on_key_down(code);
    },

    onKeyUp: async (code: string) => {
      pressedKeys.delete(code);
      app.on_key_up(code);
    },

    isDragging: () => {
      return app.is_dragging();
    },

    setOwnerBorders: (enabled: boolean) => {
      app.set_owner_borders(enabled);
      app.render();
    },

    highlightLocation: (locationIdx: number) => {
      app.highlight_location(locationIdx);
      app.render();
    },

    highlightAppLocation: async (locationId: number) => {
      app.highlight_app_location(locationId);

      app.render();
      await app.queued_work().wait();
    },

    unhighlightLocation: (locationIdx: number) => {
      app.unhighlight_location(locationIdx);
      app.render();
    },

    loadLocationData: async (locationDataFile: File) => {
      console.log("Loading location data from file...");
      const locationBuffer = await locationDataFile.arrayBuffer();
      const locationArray = new Uint32Array(locationBuffer);
      console.log("Locations loaded, count:", locationArray.length);
      app.sync_location_array(locationArray);
      console.log("Location data synced");
      app.render();
    },

    generateWorldScreenshot: async (): Promise<Blob> => {
      // The world renders in strips, so borders continue across the seams
      const shot = app.create_world_screenshot();
      try {
        const compositeCanvas = new OffscreenCanvas(shot.width(), shot.height());
        const ctx = compositeCanvas.getContext("2d");
        if (!ctx) {
          throw new Error("Failed to get 2D context for composite canvas");
        }

        const canvas = shot.canvas();
        for (let i = 0; i < shot.strip_count(); i++) {
          const strip = shot.render_strip(i);
          ctx.drawImage(
            canvas,
            0,
            0,
            strip.width,
            shot.height(),
            strip.x,
            0,
            strip.width,
            shot.height(),
          );
        }

        // Convert to PNG blob
        return await compositeCanvas.convertToBlob({ type: "image/png" });
      } finally {
        shot.free();
      }
    },
  });
};
