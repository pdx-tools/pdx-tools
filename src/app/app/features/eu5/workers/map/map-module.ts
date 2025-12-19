import { timeAsync, timeSync } from "@/lib/timeit";
import init, {
  Eu5CanvasSurface,
  Eu5WasmMapRenderer,
  Eu5WasmGameBundle,
  setup_eu5_map_wasm,
} from "../../../../wasm/wasm_eu5_map";
import type { CanvasDisplay } from "../../../../wasm/wasm_eu5_map";
import wasmPath from "../../../../wasm/wasm_eu5_map_bg.wasm?url";
import { proxy, expose } from "comlink";
import { formatInt } from "@/lib/format";
import type { ScreenshotOverlayData, TableCell } from "@/wasm/wasm_eu5";

const initialized = (async () => {
  await timeAsync("Load EU5 Map Wasm module", () =>
    init({ module_or_path: wasmPath }),
  );
  setup_eu5_map_wasm();
})();

let appResolve: (
  value: Eu5WasmMapRenderer | PromiseLike<Eu5WasmMapRenderer>,
) => void;
let appReject: (reason?: any) => void;
let appTask = new Promise<Eu5WasmMapRenderer>((res, rej) => {
  appResolve = res;
  appReject = rej;
});
let hoverEventCallback: ((event: LocationHoverChangeEvent) => void) | null =
  null;
let zoomChangeCallback: ((zoom: number) => void) | null = null;
let renderOrQueue: () => void = () => {};
let newLocations: Uint32Array | null = null;

const mapGameEndpoint = () => {
  return {
    async syncLocationData(locationArray: Uint32Array) {
      newLocations = locationArray;
      renderOrQueue();
    },

    async center_at(x: number, y: number) {
      const app = await appTask;
      app.center_at_world(x, y);
    },

    onLocationHoverUpdate: (
      callback: (event: LocationHoverChangeEvent) => void,
    ) => {
      hoverEventCallback = callback;
    },

    onZoomChange: (callback: (rawZoom: number) => void) => {
      zoomChangeCallback = callback;
    },
  };
};

export type Eu5MapEndpoint = ReturnType<typeof mapGameEndpoint>;

export const createMapEngine = async (
  {
    canvas,
    display,
  }: {
    canvas: OffscreenCanvas;
    display: CanvasDisplay;
  },
  {
    bundleFetch,
    onProgress,
  }: {
    bundleFetch: () => Promise<Uint8Array>;
    onProgress?: (increment: number) => void;
  },
) => {
  await initialized;
  onProgress?.(5); // Initialize map wasm

  const canvasInit = await timeAsync("Canvas Initialization", () =>
    Eu5CanvasSurface.init(canvas, display),
  );
  onProgress?.(5); // Canvas initialization

  const bundle = await bundleFetch();

  const gameBundle = Eu5WasmGameBundle.open(bundle);
  const textureWestData = timeSync("Create Texture Data (West)", () =>
    gameBundle.west_texture_data(),
  );

  const westView = timeSync("Upload Texture Data (West)", () =>
    canvasInit.upload_west_texture(textureWestData),
  );
  onProgress?.(12); // West texture data

  const textureEastData = timeSync("Create Texture Data (East)", () =>
    gameBundle.east_texture_data(),
  );

  const eastView = timeSync("Upload Texture Data (East)", () =>
    canvasInit.upload_east_texture(textureEastData),
  );
  onProgress?.(12); // East texture data

  try {
    const app = timeSync("Create Renderer", () =>
      Eu5WasmMapRenderer.create(
        canvasInit,
        westView,
        eastView,
        textureWestData,
        textureEastData,
      ),
    );
    onProgress?.(6); // Create renderer
    appResolve(app);
  } catch (e) {
    appReject(e);
    throw e;
  }

  const app = await appTask;

  // Send initial zoom level to game worker
  const initialZoom = app.get_zoom();
  zoomChangeCallback?.(initialZoom);

  let hoverTrackingActive = false;
  let lastKnownLocationId: number | null = null;
  let lastProcessedWorldCoordinates: { x: number; y: number } | null = null;

  let _dirtyRender: boolean = false;
  renderOrQueue = () => {
    _dirtyRender = true;
  };

  // You would think that we should only render when dirty, but for some reason
  // firefox trips over itself and the clear color bleeds through. So for now we
  // just render every frame.
  let hasLocationInformation = false;
  const rafRender = () => {
    if (newLocations) {
      hasLocationInformation = true;
      app.sync_location_array(newLocations);
      newLocations = null;
    }

    if (hasLocationInformation) {
      app.render();
    }
    requestAnimationFrame(rafRender);
  };
  rafRender();

  const startHoverTracking = () => {
    hoverTrackingActive = true;
  };

  const stopHoverTracking = () => {
    hoverTrackingActive = false;
    lastProcessedWorldCoordinates = null;
    if (lastKnownLocationId !== null) {
      hoverEventCallback?.({ kind: "clear" });
    }
    lastKnownLocationId = null;
  };

  const updateCursorWorldPosition = (canvasX: number, canvasY: number) => {
    if (!hoverTrackingActive) {
      return;
    }

    // Handle clearing cursor position (when mouse leaves canvas)
    if (canvasX < 0 || canvasY < 0) {
      if (lastKnownLocationId !== null) {
        hoverEventCallback?.({ kind: "clear" });
      }
      lastKnownLocationId = null;
      lastProcessedWorldCoordinates = null;
      return;
    }

    const worldPos = app.canvas_to_world(canvasX, canvasY);
    const worldCoordinates = { x: worldPos[0], y: worldPos[1] };

    const threshold = 1.0;
    const hasChanged =
      !lastProcessedWorldCoordinates ||
      Math.abs(worldCoordinates.x - lastProcessedWorldCoordinates.x) >=
        threshold ||
      Math.abs(worldCoordinates.y - lastProcessedWorldCoordinates.y) >=
        threshold;

    if (!hasChanged) {
      return;
    }

    lastProcessedWorldCoordinates = worldCoordinates;

    try {
      const gpuLoc = app.pick_location(canvasX, canvasY);
      let locationId = app.gpu_loc_to_app(gpuLoc);
      if (locationId !== lastKnownLocationId) {
        if (locationId) {
          hoverEventCallback?.({ kind: "update", locationIdx: locationId });
        } else {
          hoverEventCallback?.({ kind: "clear" });
        }
        lastKnownLocationId = locationId || null;
      }
    } catch (error) {
      console.error("Error in CPU hover lookup:", error);
    }
  };

  return proxy({
    resize: (width: number, height: number) => {
      canvas.height = height;
      canvas.width = width;
      app.resize(width, height);
      renderOrQueue();
    },
    get_zoom: () => {
      return app.get_zoom();
    },
    zoomAtPoint: (cursorX: number, cursorY: number, zoomDelta: number) => {
      app.zoom_at_point(cursorX, cursorY, zoomDelta);
      renderOrQueue();

      // Notify about zoom level change
      const newZoom = app.get_zoom();
      zoomChangeCallback?.(newZoom);
    },
    canvasToWorld: (canvasX: number, canvasY: number) => {
      return app.canvas_to_world(canvasX, canvasY);
    },
    setWorldPointUnderCursor: (
      worldX: number,
      worldY: number,
      canvasX: number,
      canvasY: number,
    ) => {
      app.set_world_point_under_cursor(worldX, worldY, canvasX, canvasY);
      renderOrQueue();
    },
    generateWorldScreenshot: async (
      fullResolution: boolean,
      overlayData?: ScreenshotOverlayData,
    ): Promise<Blob> => {
      const output = fullResolution
        ? { width: 16384, height: 8192 }
        : { width: 8192, height: 4096 };

      const compositeCanvas = new OffscreenCanvas(output.width, output.height);
      const ctx = compositeCanvas.getContext("2d");
      if (!ctx) {
        throw new Error("Failed to get 2D context for composite canvas");
      }

      // Create small overlay canvas if provided (minimal memory footprint ~3MB vs 512MB)
      let overlayInfo: OverlayCanvasInfo | null = null;
      if (overlayData) {
        overlayInfo = createOverlayCanvas(
          overlayData,
          fullResolution,
          output.height,
        );
      }

      // Create dedicated screenshot canvas for independent screenshot renderer
      const screenshotCanvas = new OffscreenCanvas(8192, 8192);

      // Create independent screenshot renderer
      const screenshotRenderer =
        app.create_screenshot_renderer(screenshotCanvas);

      // Render west tile using independent screenshot renderer
      screenshotRenderer.render_west_tile();
      ctx.drawImage(screenshotCanvas, 0, 0, output.width / 2, output.height);

      // Render east tile using independent screenshot renderer
      screenshotRenderer.render_east_tile();
      ctx.drawImage(
        screenshotCanvas,
        output.width / 2,
        0,
        output.width / 2,
        output.height,
      );

      // Composite the small overlay canvas on top if provided
      if (overlayInfo) {
        ctx.drawImage(overlayInfo.canvas, overlayInfo.x, overlayInfo.y);
      }

      // Convert composite canvas to PNG blob and return
      return compositeCanvas.convertToBlob({ type: "image/png" });
    },

    getLocationUnderCursor: async (
      canvasX: number,
      canvasY: number,
    ): Promise<
      { kind: "throttled" } | ({ kind: "result" } & LocationLookupResult)
    > => {
      const gpuLoc = app.pick_location(canvasX, canvasY);
      let locationId = app.gpu_loc_to_app(gpuLoc);
      return { kind: "result", locationIdx: gpuLoc, locationId };
    },

    async execCommands(commands: MapCommand[]) {
      for (const command of commands) {
        switch (command.kind) {
          case "unhighlight": {
            app.unhighlight_location(command.locationIdx);
            break;
          }
          case "highlight": {
            app.highlight_location(command.locationIdx);
            break;
          }
          case "render": {
            renderOrQueue();
            break;
          }
          case "setOwnerBorders": {
            app.set_owner_borders(command.enabled);
            break;
          }
        }
      }
    },

    unhighlightLocation: (locationIdx: number) => {
      app.unhighlight_location(locationIdx);
    },

    highlightLocation: (locationIdx: number) => {
      app.highlight_location(locationIdx);
    },

    updateCursorWorldPosition: updateCursorWorldPosition,

    startHoverTracking: startHoverTracking,

    stopHoverTracking: stopHoverTracking,
  });
};

export type MapCommand =
  | { kind: "unhighlight"; locationIdx: number }
  | { kind: "highlight"; locationIdx: number }
  | { kind: "setOwnerBorders"; enabled: boolean }
  | { kind: "render" };

export type LocationLookupResult = {
  locationIdx: number;
  locationId: number;
};

export type LocationHoverChangeEvent =
  | {
      kind: "update";
      locationIdx: number;
    }
  | { kind: "clear" };

interface OverlayCanvasInfo {
  canvas: OffscreenCanvas;
  x: number;
  y: number;
}

function createOverlayCanvas(
  overlayData: ScreenshotOverlayData,
  fullResolution: boolean,
  compositeHeight: number,
): OverlayCanvasInfo {
  const multiplier = fullResolution ? 2 : 1;
  const baseFontSize = Math.trunc(compositeHeight / 100);
  const padding = 24 * multiplier;
  const headerSpacing = 64 * multiplier;

  // Create a temporary canvas just for measuring text
  const tempCanvas = new OffscreenCanvas(1, 1);
  const tempCtxRaw = tempCanvas.getContext("2d");
  if (!tempCtxRaw) {
    throw new Error("Failed to create temporary canvas context");
  }
  const tempCtx = tempCtxRaw;

  // Fonts
  const headerFont = `700 ${baseFontSize}px ui-sans-serif, system-ui, sans-serif`;
  const bodyFont = `400 ${Math.trunc(baseFontSize * 0.8)}px ui-sans-serif, system-ui, sans-serif`;
  const bodyLineHeight = Math.trunc(baseFontSize * 0.9);

  // Helper function to convert TableCell to display string
  function cellToString(cell: TableCell): string {
    if (cell.type === "text") {
      return cell.value;
    } else if (cell.type === "integer") {
      return formatInt(cell.value);
    } else if (cell.type === "float") {
      return cell.value.value.toFixed(cell.value.decimals);
    }
    return "";
  }

  // Header measurements
  tempCtx.font = headerFont;
  const titleMetrics = tempCtx.measureText(overlayData.title);
  const dateAndPatchText = `${overlayData.saveDate} (${overlayData.patchVersion})`;
  const dateAndPatchMetrics = tempCtx.measureText(dateAndPatchText);
  const headerHeight =
    titleMetrics.actualBoundingBoxAscent +
    titleMetrics.actualBoundingBoxDescent;
  const maxHeaderWidth =
    titleMetrics.width + headerSpacing + dateAndPatchMetrics.width;

  // Table data
  tempCtx.font = bodyFont;
  const { leftTable, rightTable } = overlayData.body;
  const maxRows = overlayData.body.maxRows || 10;
  const leftRows = leftTable.rows.slice(0, maxRows);
  const rightRows = rightTable.rows.slice(0, maxRows);
  const columnSpacing = 40 * multiplier;
  const tableGap = 80 * multiplier;

  // Helper function to calculate column widths
  function calculateColumnWidths(table: any, rows: TableCell[][]): number[] {
    return table.headers.map((header: string, colIndex: number) => {
      let maxWidth = tempCtx.measureText(header).width;
      rows.forEach((row) => {
        const cell = row[colIndex];
        const cellData = cell ? cellToString(cell) : "";
        const cellWidth = tempCtx.measureText(cellData).width;
        maxWidth = Math.max(maxWidth, cellWidth);
      });
      return maxWidth;
    });
  }

  // Calculate table dimensions
  const leftColumnWidths = calculateColumnWidths(leftTable, leftRows);
  const rightColumnWidths = calculateColumnWidths(rightTable, rightRows);

  const leftTableWidth =
    leftColumnWidths.reduce((sum, width) => sum + width, 0) +
    (leftColumnWidths.length - 1) * columnSpacing;
  const rightTableWidth =
    rightColumnWidths.reduce((sum, width) => sum + width, 0) +
    (rightColumnWidths.length - 1) * columnSpacing;

  // Adjust for table titles
  const adjustedLeftTableWidth = leftTable.title
    ? Math.max(leftTableWidth, tempCtx.measureText(leftTable.title).width)
    : leftTableWidth;
  const adjustedRightTableWidth = rightTable.title
    ? Math.max(rightTableWidth, tempCtx.measureText(rightTable.title).width)
    : rightTableWidth;

  const totalTableWidth =
    adjustedLeftTableWidth + tableGap + adjustedRightTableWidth;

  // Layout calculations
  const titleRowHeight =
    leftTable.title || rightTable.title ? bodyLineHeight : 0;
  const totalBodyHeight =
    titleRowHeight + bodyLineHeight + leftRows.length * bodyLineHeight;
  const backdropWidth = Math.max(maxHeaderWidth, totalTableWidth) + padding * 2;
  const backdropHeight = headerHeight + totalBodyHeight + padding * 4;

  // Create overlay canvas sized exactly to fit the infographic
  const overlayCanvas = new OffscreenCanvas(
    Math.ceil(backdropWidth),
    Math.ceil(backdropHeight),
  );
  const ctxRaw = overlayCanvas.getContext("2d");
  if (!ctxRaw) {
    throw new Error("Failed to create overlay canvas context");
  }
  const ctx = ctxRaw;

  // Draw backdrop
  ctx.fillStyle = "#20272c";
  ctx.beginPath();
  ctx.roundRect(0, 0, backdropWidth, backdropHeight, 20 * multiplier);
  ctx.fill();

  // Draw content
  ctx.fillStyle = "#ffffff";
  let currentY = padding;

  // Header
  ctx.font = headerFont;
  currentY += headerHeight;
  ctx.fillText(overlayData.title, padding, currentY);
  const rightAlignX = backdropWidth - padding - dateAndPatchMetrics.width;
  ctx.fillText(dateAndPatchText, rightAlignX, currentY);

  // Tables
  ctx.font = bodyFont;
  currentY += padding;

  const leftTableX = padding;
  const rightTableX = leftTableX + adjustedLeftTableWidth + tableGap;

  // Helper function to render a table
  function renderTable(
    table: any,
    rows: TableCell[][],
    columnWidths: number[],
    startX: number,
  ) {
    let y = currentY;

    // Table title
    if (table.title) {
      y += bodyLineHeight;
      ctx.fillText(table.title, startX, y);
    }

    // Headers
    y += bodyLineHeight;
    let x = startX;
    table.headers.forEach((header: string, colIndex: number) => {
      ctx.fillText(header, x, y);
      x += columnWidths[colIndex] + columnSpacing;
    });

    // Data rows
    rows.forEach((row: TableCell[]) => {
      y += bodyLineHeight;
      x = startX;
      row.forEach((cell: TableCell, colIndex: number) => {
        const cellData = cellToString(cell);
        // Right-align numeric columns (except first column)
        if (
          colIndex > 0 &&
          (cell.type === "integer" || cell.type === "float")
        ) {
          const textWidth = ctx.measureText(cellData).width;
          ctx.fillText(cellData, x + columnWidths[colIndex] - textWidth, y);
        } else {
          ctx.fillText(cellData, x, y);
        }
        x += columnWidths[colIndex] + columnSpacing;
      });
    });
  }

  // Render both tables
  renderTable(leftTable, leftRows, leftColumnWidths, leftTableX);
  renderTable(rightTable, rightRows, rightColumnWidths, rightTableX);

  // Calculate position where overlay should be placed on composite canvas
  const overlayX = 100 * multiplier;
  const overlayY = compositeHeight - backdropHeight - 100 * multiplier;

  return {
    canvas: overlayCanvas,
    x: overlayX,
    y: overlayY,
  };
}

export function initialize(port: MessagePort) {
  const endpoint = mapGameEndpoint();
  expose(endpoint, port);
}
