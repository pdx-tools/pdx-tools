import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SharedCanvasEventAction, SharedCanvasInputWriter } from "@/lib/canvas_courier/ring_buffer";
import type { Eu5MapEndpoint } from "./map-module";

const mocks = vi.hoisted(() => {
  // The map draws only when a frame is due, which a change to its picture makes.
  const frame = { due: true };
  const change = () => {
    frame.due = true;
  };
  return {
    frame,
    expose: vi.fn(),
    app: {
      get_zoom: vi.fn(() => 1),
      world_size: vi.fn(() => [1000, 500]),
      viewport_world_rect: vi.fn(() => [0, 0, 800, 400]),
      canvas_to_world: vi.fn(() => [100, 100]),
      pick_location: vi.fn(() => 1),
      gpu_loc_to_app: vi.fn((_gpu: number) => 1),
      sync_location_array: vi.fn(change),
      sync_grouping_table: vi.fn(),
      sync_color_array: vi.fn(change),
      sync_flag_array: vi.fn(change),
      on_key_down: vi.fn(),
      on_key_up: vi.fn(),
      on_cursor_move: vi.fn(),
      on_mouse_button: vi.fn(),
      preview_box_highlight: vi.fn(),
      commit_box_selection: vi.fn(() => new Uint32Array([1])),
      clear_box_highlight: vi.fn(),
      clear_committed_box_highlight: vi.fn(),
      queued_work: vi.fn(() => ({ wait: async () => {} })),
      resize: vi.fn(change),
      tick: vi.fn(),
      frame_due: vi.fn(() => frame.due),
      request_frame: vi.fn(change),
      render: vi.fn(() => {
        frame.due = false;
      }),
    },
  };
});

vi.mock("../../../../wasm/wasm_eu5_map", () => ({
  default: vi.fn(async () => {}),
  Eu5CanvasSurface: {
    init: vi.fn(async () => ({
      upload_west_texture: vi.fn(),
      upload_east_texture: vi.fn(),
    })),
  },
  Eu5WasmMapBundle: { open: () => ({ load_texture_data: () => ({}) }) },
  Eu5WasmMapRenderer: { create: () => mocks.app },
  setup_eu5_map_wasm: vi.fn(),
  location_borders_at_zoom: vi.fn(),
}));
vi.mock("@/lib/log", () => ({ log: vi.fn() }));
vi.mock("comlink", () => ({ proxy: (value: unknown) => value, expose: mocks.expose }));

let frames: FrameRequestCallback[];

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.frame.due = true;
  frames = [];
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  mocks.app.render.mockReset();
  mocks.app.canvas_to_world.mockImplementation(() => [100, 100]);
  mocks.app.pick_location.mockImplementation(() => 1);
  mocks.app.gpu_loc_to_app.mockImplementation(() => 1);
});

/** The world position and location under the cursor are the last x that the map was given. */
function followCursor() {
  const x = () => mocks.app.on_cursor_move.mock.lastCall?.[0] ?? 0;
  mocks.app.canvas_to_world.mockImplementation(() => [x(), 0]);
  mocks.app.pick_location.mockImplementation(x);
  mocks.app.gpu_loc_to_app.mockImplementation((gpu: number) => gpu);
}

async function nextFrame() {
  const frame = frames.shift();
  expect(frame).toBeDefined();
  await frame!(0);
}

async function openMap() {
  const module = await import("./map-module");
  const config = { buffer: new SharedArrayBuffer(64 + 32 * 32), capacity: 32 };
  const writer = new SharedCanvasInputWriter(config);
  const engine = await module.createMapEngine(
    {
      canvas: {} as OffscreenCanvas,
      display: { width: 960, height: 640, scaleFactor: 2 },
      inputConfig: config,
    },
    { mapBundle: { fetch: async () => new Uint8Array() } },
  );
  await module.initialize({} as MessagePort, "info");
  const endpoint = mocks.expose.mock.calls[0][0] as Eu5MapEndpoint;
  await endpoint.syncSave({ locations: new Uint32Array([1]), groupingTable: new Uint32Array([1]) });
  await nextFrame();
  return { writer, engine, endpoint };
}

function key(code: string): KeyboardEvent {
  return { type: "keydown", code, repeat: false, location: 0, timeStamp: 1 } as KeyboardEvent;
}

function pointer(shiftKey = false, offsetX = 10): PointerEvent {
  return {
    offsetX,
    offsetY: 20,
    button: 0,
    pointerId: 1,
    pointerType: "mouse",
    shiftKey,
    timeStamp: 1,
  } as PointerEvent;
}

describe("EU5 map input lifecycle", () => {
  it("releases held keys and cancels a box selection on blur", async () => {
    const { writer, engine } = await openMap();
    const overlay = vi.fn();
    const cursor = vi.fn();
    engine.onBoxSelectRectUpdate(overlay);
    engine.onCursorHintUpdate(cursor);
    writer.enqueueKeyboard(key("ArrowRight"));
    writer.enqueueKeyboard(key("ShiftLeft"));
    writer.enqueuePointer(pointer(true), SharedCanvasEventAction.Down);
    await nextFrame();
    expect(overlay).toHaveBeenCalledWith(expect.objectContaining({ operation: "add" }));

    writer.enqueueBlur(2);
    await nextFrame();
    expect(mocks.app.on_key_up.mock.calls).toEqual([["ArrowRight"], ["ShiftLeft"]]);
    expect(mocks.app.clear_box_highlight).toHaveBeenCalledOnce();
    expect(mocks.app.on_mouse_button).toHaveBeenLastCalledWith(0, false);
    expect(overlay).toHaveBeenLastCalledWith(null);
    expect(cursor).toHaveBeenLastCalledWith("default");

    writer.enqueueBlur(3);
    await nextFrame();
    expect(mocks.app.on_key_up).toHaveBeenCalledTimes(2);
    expect(mocks.app.clear_box_highlight).toHaveBeenCalledOnce();
  });

  it("ends a map drag and pauses rendering until the surface is visible", async () => {
    const { writer } = await openMap();
    writer.enqueueKeyboard(key("KeyW"));
    writer.enqueuePointer(pointer(), SharedCanvasEventAction.Down);
    await nextFrame();
    expect(mocks.app.on_mouse_button).toHaveBeenLastCalledWith(0, true);
    const ticks = mocks.app.tick.mock.calls.length;
    const renders = mocks.app.render.mock.calls.length;

    writer.enqueueVisibility(true, 2);
    writer.enqueueResize({ width: 1280, height: 720, scaleFactor: 2 }, 3);
    await nextFrame();
    await nextFrame();
    expect(mocks.app.on_key_up).toHaveBeenCalledWith("KeyW");
    expect(mocks.app.on_mouse_button).toHaveBeenLastCalledWith(0, false);
    expect(mocks.app.tick).toHaveBeenCalledTimes(ticks);
    expect(mocks.app.render).toHaveBeenCalledTimes(renders);
    expect(mocks.app.resize).not.toHaveBeenCalled();

    writer.enqueueFocus(4);
    writer.enqueueVisibility(false, 5);
    await nextFrame();
    expect(mocks.app.resize).toHaveBeenCalledWith(1280, 720, 2);
    expect(mocks.app.tick).toHaveBeenCalledTimes(ticks + 1);
    expect(mocks.app.render).toHaveBeenCalledTimes(renders + 1);
    writer.enqueueKeyboard(key("KeyW"));
    await nextFrame();
    expect(mocks.app.on_key_down.mock.calls).toEqual([["KeyW"], ["KeyW"]]);
  });
});

describe("EU5 map frame loop", () => {
  it("draws a resting map once, then once for each change", async () => {
    const { writer, endpoint } = await openMap();
    expect(mocks.app.render).toHaveBeenCalledOnce();
    await nextFrame();
    await nextFrame();
    expect(mocks.app.render).toHaveBeenCalledOnce();
    expect(frames).toHaveLength(1);

    // Data from the game worker draws in the frame that applies it.
    await endpoint.syncMapData({ colors: new Uint32Array([7]) });
    await nextFrame();
    expect(mocks.app.render).toHaveBeenCalledTimes(2);

    writer.enqueueResize({ width: 1280, height: 720, scaleFactor: 2 }, 1);
    await nextFrame();
    await nextFrame();
    expect(mocks.app.render).toHaveBeenCalledTimes(3);

    // A hidden map draws nothing, and draws again once it shows.
    writer.enqueueVisibility(true, 2);
    await nextFrame();
    writer.enqueueVisibility(false, 3);
    await nextFrame();
    await nextFrame();
    expect(mocks.app.render).toHaveBeenCalledTimes(4);
  });

  it("draws every frame in Firefox", async () => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (rv:145.0) Gecko/20100101 Firefox/145.0",
    });
    await openMap();
    const renders = mocks.app.render.mock.calls.length;
    await nextFrame();
    await nextFrame();
    expect(mocks.app.render).toHaveBeenCalledTimes(renders + 2);
  });

  it("keeps drawing after failed frames and logs the failure once", async () => {
    const { endpoint } = await openMap();
    await endpoint.syncMapData({ colors: new Uint32Array([7]) });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const lost = new Error("surface lost");
    mocks.app.render.mockImplementationOnce(() => {
      throw lost;
    });
    mocks.app.render.mockImplementationOnce(() => {
      throw lost;
    });
    await nextFrame();
    await nextFrame();
    const renders = mocks.app.render.mock.calls.length;

    // The failed frame is still due, and draws once the map recovers.
    await nextFrame();
    await nextFrame();
    expect(mocks.app.render).toHaveBeenCalledTimes(renders + 1);
    expect(frames).toHaveLength(1);
    expect(consoleError).toHaveBeenCalledOnce();
    expect(consoleError).toHaveBeenCalledWith(expect.any(String), lost);
  });
});

describe("EU5 map overlay", () => {
  const overlay = (token: number) => ({
    token,
    colors: new Uint32Array([10 + token]),
    flags: new Uint32Array([20 + token]),
    groups: new Uint32Array([30 + token]),
  });

  it("refuses a frame older than the newest frame or clear", async () => {
    const { engine, endpoint } = await openMap();
    expect(await endpoint.presentOverlay(overlay(2))).toBe(true);
    expect(await endpoint.presentOverlay(overlay(1))).toBe(false);
    await engine.clearOverlay(3);
    // A paint that was in flight when the preview ended arrives late.
    expect(await endpoint.presentOverlay(overlay(2))).toBe(false);
    await nextFrame();
    expect(mocks.app.sync_color_array).not.toHaveBeenCalled();
    expect(mocks.app.sync_flag_array).not.toHaveBeenCalled();
  });

  it("keeps the save under the overlay and shows it again when the overlay clears", async () => {
    const { engine, endpoint } = await openMap();
    mocks.app.sync_location_array.mockClear();
    mocks.app.sync_grouping_table.mockClear();
    await endpoint.presentOverlay(overlay(1));
    await nextFrame();
    expect(mocks.app.sync_color_array).toHaveBeenLastCalledWith(overlay(1).colors);
    expect(mocks.app.sync_flag_array).toHaveBeenLastCalledWith(overlay(1).flags);
    expect(mocks.app.sync_grouping_table).toHaveBeenLastCalledWith(overlay(1).groups);

    // The save changes below the overlay, as when its selection is restored.
    const colors = new Uint32Array([7]);
    await endpoint.syncMapData({ colors });
    await endpoint.syncGroupingTable(new Uint32Array([8]));
    await nextFrame();
    expect(mocks.app.sync_color_array).toHaveBeenCalledTimes(1);

    // A new save under the overlay gets its locations, and the overlay stays on top.
    const locations = new Uint32Array([9]);
    await endpoint.syncSave({ locations, groupingTable: new Uint32Array([6]) });
    await nextFrame();
    expect(mocks.app.sync_location_array).toHaveBeenLastCalledWith(locations);
    expect(mocks.app.sync_color_array).toHaveBeenLastCalledWith(overlay(1).colors);
    expect(mocks.app.sync_grouping_table).toHaveBeenLastCalledWith(overlay(1).groups);

    await engine.clearOverlay(2);
    await nextFrame();
    expect(mocks.app.sync_location_array).toHaveBeenLastCalledWith(locations);
    expect(mocks.app.sync_grouping_table).toHaveBeenLastCalledWith(new Uint32Array([6]));
    expect(mocks.app.sync_color_array).toHaveBeenLastCalledWith(overlay(1).colors);
    expect(mocks.app.sync_color_array).toHaveBeenCalledTimes(2);
  });
});

describe("EU5 map box selection", () => {
  // Let the commit promises settle.
  const settle = () => new Promise((resolve) => setTimeout(resolve));

  async function shiftClick(writer: SharedCanvasInputWriter, upX = 10) {
    writer.enqueuePointer(pointer(true), SharedCanvasEventAction.Down);
    writer.enqueuePointer(pointer(true, upX), SharedCanvasEventAction.Up);
    await nextFrame();
  }

  it("keeps committed areas highlighted until the game worker applies the last one", async () => {
    const { writer, endpoint } = await openMap();
    const applied: Array<() => void> = [];
    endpoint.onBoxSelectCommit(() => new Promise<void>((resolve) => applied.push(resolve)));
    await shiftClick(writer);
    await shiftClick(writer);
    expect(applied).toHaveLength(2);

    applied[0]();
    await settle();
    await nextFrame();
    expect(mocks.app.clear_committed_box_highlight).not.toHaveBeenCalled();

    // The game worker sends the new flags before its commit settles. The
    // highlight clears in the frame that applies them, after them.
    const flags = new Uint32Array([5]);
    await endpoint.syncMapData({ flags });
    applied[1]();
    await settle();
    expect(mocks.app.clear_committed_box_highlight).not.toHaveBeenCalled();
    await nextFrame();
    expect(mocks.app.clear_committed_box_highlight).toHaveBeenCalledOnce();
    expect(mocks.app.sync_flag_array).toHaveBeenLastCalledWith(flags);
    expect(mocks.app.sync_flag_array.mock.invocationCallOrder.at(-1)).toBeLessThan(
      mocks.app.clear_committed_box_highlight.mock.invocationCallOrder[0],
    );
    expect(mocks.app.clear_box_highlight).not.toHaveBeenCalled();
  });

  it("sends the hover at the pointer-up position and clears it when the pointer leaves", async () => {
    const { writer, engine, endpoint } = await openMap();
    const hover = vi.fn();
    const commit = vi.fn(async () => {});
    endpoint.onLocationHoverUpdate(hover);
    endpoint.onBoxSelectCommit(commit);
    engine.startHoverTracking();
    followCursor();

    await shiftClick(writer, 30);
    expect(commit).toHaveBeenCalledWith(expect.objectContaining({ hoverLocationIdx: 30 }));

    writer.enqueuePointerLeave(pointer());
    await nextFrame();
    expect(hover).toHaveBeenLastCalledWith({ kind: "clear" });
  });

  it("hovers and clicks the location under the cursor after a drag", async () => {
    const { writer, engine, endpoint } = await openMap();
    const hover = vi.fn();
    const click = vi.fn();
    endpoint.onLocationHoverUpdate(hover);
    endpoint.onLocationClickUpdate(click);
    endpoint.onBoxSelectCommit(vi.fn(async () => {}));
    engine.startHoverTracking();
    followCursor();
    writer.enqueuePointer(pointer(false, 10), SharedCanvasEventAction.Move);
    await nextFrame();
    expect(hover).toHaveBeenLastCalledWith({ kind: "update", locationIdx: 10 });

    // Drag from 10 to 30, then go back to 10 and click.
    await shiftClick(writer, 30);
    writer.enqueuePointer(pointer(false, 10), SharedCanvasEventAction.Move);
    writer.enqueuePointer(pointer(false, 10), SharedCanvasEventAction.Down);
    writer.enqueuePointer(pointer(false, 10), SharedCanvasEventAction.Up);
    await nextFrame();
    expect(hover).toHaveBeenLastCalledWith({ kind: "update", locationIdx: 10 });
    expect(click).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: "update", locationIdx: 10 }),
    );
  });
});
