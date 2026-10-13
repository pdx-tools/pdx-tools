import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SharedCanvasEventAction, SharedCanvasInputWriter } from "@/lib/canvas_courier/ring_buffer";

const mocks = vi.hoisted(() => ({
  expose: vi.fn(),
  app: {
    get_zoom: vi.fn(() => 1),
    world_size: vi.fn(() => [1000, 500]),
    viewport_world_rect: vi.fn(() => [0, 0, 800, 400]),
    canvas_to_world: vi.fn(() => [100, 100]),
    pick_location: vi.fn(() => 1),
    gpu_loc_to_app: vi.fn(() => 1),
    sync_location_array: vi.fn(),
    sync_grouping_table: vi.fn(),
    on_key_down: vi.fn(),
    on_key_up: vi.fn(),
    on_cursor_move: vi.fn(),
    on_mouse_button: vi.fn(),
    preview_box_highlight: vi.fn(),
    clear_box_highlight: vi.fn(),
    queued_work: vi.fn(() => ({ wait: async () => {} })),
    resize: vi.fn(),
    tick: vi.fn(),
    render: vi.fn(),
  },
}));

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
  frames = [];
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
});

afterEach(() => vi.unstubAllGlobals());

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
  const endpoint = mocks.expose.mock.calls[0][0] as {
    syncSave(save: { locations: Uint32Array; groupingTable: Uint32Array }): Promise<void>;
  };
  await endpoint.syncSave({ locations: new Uint32Array([1]), groupingTable: new Uint32Array([1]) });
  await nextFrame();
  return { writer, engine };
}

function key(code: string): KeyboardEvent {
  return { type: "keydown", code, repeat: false, location: 0, timeStamp: 1 } as KeyboardEvent;
}

function pointer(shiftKey = false): PointerEvent {
  return {
    offsetX: 10,
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
