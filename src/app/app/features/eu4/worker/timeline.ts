import { transfer } from "comlink";
import { wasm } from "./common";
import type { SaveFile, TimelineCursor, TimelineData, TimelineKind } from "@/wasm/wasm_eu4";

/**
 * The province colors for one timeline date, split into the textures the
 * map uploads. `days` is where the cursor landed after it clamped the
 * request to the timeline.
 */
export type MapTimelapseItem = {
  days: number;
  primary: Uint8Array;
  secondary: Uint8Array;
  country: Uint8Array;
};

/**
 * The cursor that steps a timelapse through the save, kept between calls
 * so a forward step replays only the events since the last date. It holds
 * a reference into the save it was built from, so it is only stepped while
 * `save` is still the current one. A new save gets a new cursor; a reparse
 * keeps the same save object, so it drops the cursor explicitly (see
 * `resetTimelineCursor`).
 */
let cursor:
  | { save: SaveFile; kind: TimelineKind; cursor: TimelineCursor; parts: number }
  | undefined;

export function eu4GetTimeline(kind: TimelineKind): TimelineData {
  return wasm.save.get_timeline(kind);
}

export function eu4TimelineAdvance(kind: TimelineKind, day: number): MapTimelapseItem {
  const save = wasm.save;
  if (cursor === undefined || cursor.save !== save || cursor.kind !== kind) {
    cursor?.cursor.free();
    const next = save.timeline_cursor(kind);
    cursor = { save, kind, cursor: next, parts: next.parts() };
  }
  const item = cursor.cursor.advance_to(day);
  const days = item.days;
  // Wasm-bindgen does not return SharedArrayBuffers so this cast is safe
  const arr = item.data() as Uint8Array<ArrayBuffer>;
  const part = arr.length / cursor.parts;
  const primary = arr.subarray(0, part);
  const secondary = arr.subarray(part, part * 2);
  // Political colors double as the country colors, so they come in two parts.
  const country = cursor.parts === 3 ? arr.subarray(part * 2) : primary;
  return transfer({ days, primary, secondary, country }, [arr.buffer]);
}

/**
 * Drop the cursor. Called in the worker right after a watched save is
 * reparsed in place, so no step can run against a cursor built from the
 * old contents of the same save object.
 */
export function resetTimelineCursor() {
  cursor?.cursor.free();
  cursor = undefined;
}
