import { findCarriedCountry } from "../../campaignCarry";
import type { CarriedSelection, CountryIdentity, Eu5Carry } from "../../campaignCarry";
import type { LocationClickChangeEvent } from "../map/map-module";
import { SharedCanvasModifierBits } from "@/lib/canvas_courier";
import type { Eu5App, MapChangeData } from "@/wasm/wasm_eu5";

type Countries = ReturnType<Eu5App["get_countries"]>["countries"];
type ClickApp = Pick<Eu5App, "click" | "clear_focus_or_selection">;

type ViewApp = ClickApp &
  Pick<
    Eu5App,
    | "set_map_mode"
    | "select_players"
    | "change_selection"
    | "focus_in_selection"
    | "market_at_center_id"
    | "get_selection_summary"
  >;

type CaptureApp = Pick<Eu5App, "selection_target" | "market_center_id" | "get_selection_summary">;

/** Change the selection as a click on the map does. */
export function clickChange(app: ClickApp, event: LocationClickChangeEvent): MapChangeData {
  if (event.kind === "clear") return app.clear_focus_or_selection();
  const op =
    event.modifiers & SharedCanvasModifierBits.Shift
      ? "add"
      : event.modifiers & SharedCanvasModifierBits.Alt
        ? "remove"
        : "replace";
  return app.click(op, event.locationIdx);
}

/**
 * The selection by values that stay the same across saves: a country by its
 * identity, a market by the id of its center location, and a location by
 * its index.
 */
export function captureSelection(app: CaptureApp, countries: Countries): CarriedSelection | null {
  const target = app.selection_target();
  if (!target) return null;
  const focusedLocation = app.get_selection_summary().focusedLocation ?? null;
  switch (target.kind) {
    case "players":
      return { target, focusedLocation };
    case "countries": {
      const keys = new Set(target.ids);
      const identities: CountryIdentity[] = countries
        .filter((c) => keys.has(c.country.key))
        .map(({ id, tag }) => ({ id, tag }));
      return { target: { kind: "countries", countries: identities }, focusedLocation };
    }
    case "markets": {
      const centers = target.ids.flatMap((id) => app.market_center_id(id) ?? []);
      return { target: { kind: "markets", centers }, focusedLocation };
    }
    case "locations":
      return { target: { kind: "locations", locations: target.ids }, focusedLocation };
  }
}

/** Restore a campaign view within the game worker, before publishing its buffers. */
export function restoreCampaignView(app: ViewApp, countries: Countries, carry: Eu5Carry) {
  const change = app.set_map_mode(carry.mapMode);
  const merge = (next: MapChangeData) => {
    change.colorsChanged ||= next.colorsChanged;
    change.flagsChanged ||= next.flagsChanged;
    change.gradient = next.gradient;
  };
  const selection = carry.selection;
  const target = selection?.target;
  // A country or market that is gone from this save leaves the selection.
  if (target?.kind === "players") merge(app.select_players());
  else if (target?.kind === "countries") {
    const keys = target.countries.flatMap((c) => findCarriedCountry(countries, c) ?? []);
    merge(app.change_selection("replace", "countries", Uint32Array.from(keys)));
  } else if (target?.kind === "markets") {
    const ids = target.centers.flatMap((center) => app.market_at_center_id(center) ?? []);
    merge(app.change_selection("replace", "markets", Uint32Array.from(ids)));
  } else if (target?.kind === "locations") {
    merge(app.change_selection("replace", "locations", Uint32Array.from(target.locations)));
  }
  if (selection?.focusedLocation != null) merge(app.focus_in_selection(selection.focusedLocation));
  // A click on a snapshot applies to the save of that snapshot.
  if (carry.inspection) merge(clickChange(app, carry.inspection.click));

  return { change, selection: app.get_selection_summary() };
}
