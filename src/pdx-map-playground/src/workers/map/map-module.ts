import init, {
  PdxCanvasSurface,
  PdxMapImage,
  PdxMapRenderer,
} from "../wasm/wasm_pdx_map";
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

// Process uploaded map image into textures
async function processMapImage(
  imageFile: File,
): Promise<{ image: PdxMapImage; tileWidth: number; tileHeight: number }> {
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
    tileWidth: imageBitmap.width / 2,
    tileHeight: imageBitmap.height,
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
  const {
    tileWidth,
    tileHeight,
    image: indexedImage,
  } = await processMapImage(mapImageFile);

  // Upload textures with their dimensions
  const westView = canvasInit.upload_west_texture(indexedImage);
  console.log("West texture uploaded");

  const eastView = canvasInit.upload_east_texture(indexedImage);
  console.log("East texture uploaded");

  try {
    console.log("Creating map renderer...");
    const app = PdxMapRenderer.create(
      canvasInit,
      indexedImage,
      westView,
      eastView,
      display,
    );
    console.log("Map renderer created");

    appResolve(app);
  } catch (e) {
    console.error("Error creating map renderer:", e);
    appReject(e);
    throw e;
  }

  const app = await appTask;
  app.render();
  app.present();
  let inProgressReadback = false;

  console.log("Returning proxied map engine functions");
  return proxy({
    resize: async (width: number, height: number) => {
      const gl = canvas.getContext("webgpu")!;
      gl.canvas.height = height;
      gl.canvas.width = width;
      app.resize(width, height);
      app.render();
      app.present();
    },

    get_zoom: () => {
      return app.get_zoom();
    },

    zoomAtPoint: async (
      cursorX: number,
      cursorY: number,
      zoomDelta: number,
    ) => {
      app.zoom_at_point(cursorX, cursorY, zoomDelta);
      app.render();
      app.present();
    },

    canvasToWorld: (canvasX: number, canvasY: number) => {
      return app.canvas_to_world(canvasX, canvasY);
    },

    setWorldPointUnderCursor: async (
      worldX: number,
      worldY: number,
      canvasX: number,
      canvasY: number,
    ) => {
      app.set_world_point_under_cursor(worldX, worldY, canvasX, canvasY);
      app.render();
      app.present();
    },

    setOwnerBorders: (enabled: boolean) => {
      app.set_owner_borders(enabled);
      app.render();
      app.present();
    },

    highlightLocation: (locationIdx: number) => {
      app.highlight_location(locationIdx);
      app.render();
    },

    highlightAppLocation: async (locationId: number) => {
      app.highlight_app_location(locationId);

      app.render();
      await app.queued_work().wait();
      app.present();
    },

    unhighlightLocation: (locationIdx: number) => {
      app.unhighlight_location(locationIdx);
      app.render();
    },

    getLocationUnderCursor: async (
      canvasX: number,
      canvasY: number,
    ): Promise<
      { kind: "throttled" } | ({ kind: "result" } & LocationLookupResult)
    > => {
      if (inProgressReadback) {
        return { kind: "throttled" };
      }

      try {
        inProgressReadback = true;
        const readback = app.create_location_color_id_readback(
          canvasX,
          canvasY,
        );
        const locationIdx = await readback.read_id();
        if (locationIdx === undefined) {
          throw new Error(`No location found for color ID`);
        }

        const locationId = app.lookup_location_id(locationIdx);
        return { kind: "result", locationIdx: locationIdx.value(), locationId };
      } finally {
        inProgressReadback = false;
      }
    },

    loadLocationData: async (locationDataFile: File) => {
      console.log("Loading location data from file...");
      const locationBuffer = await locationDataFile.arrayBuffer();
      const locationArray = new Uint32Array(locationBuffer);
      console.log("Locations loaded, count:", locationArray.length);
      app.sync_location_array(locationArray);
      console.log("Location data synced");
      app.render();
      app.present();
    },

    generateWorldScreenshot: async (): Promise<Blob> => {
      // Create composite canvas with full map dimensions (2:1 aspect ratio)
      const fullWidth = tileWidth * 2;
      const fullHeight = tileHeight;
      const compositeCanvas = new OffscreenCanvas(fullWidth, fullHeight);
      const ctx = compositeCanvas.getContext("2d");
      if (!ctx) {
        throw new Error("Failed to get 2D context for composite canvas");
      }

      // Create dedicated screenshot canvas for rendering each tile
      const screenshotCanvas = new OffscreenCanvas(tileWidth, tileHeight);

      // Create independent screenshot renderer
      const screenshotRenderer =
        app.create_screenshot_renderer(screenshotCanvas);

      // Render west tile
      screenshotRenderer.render_west_tile();
      ctx.drawImage(screenshotCanvas, 0, 0, tileWidth, fullHeight);

      // Render east tile
      screenshotRenderer.render_east_tile();
      ctx.drawImage(screenshotCanvas, tileWidth, 0, tileWidth, fullHeight);

      // Convert to PNG blob
      return await compositeCanvas.convertToBlob({ type: "image/png" });
    },
  });
};
