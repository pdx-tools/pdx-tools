import type React from "react";
import { createContext, useCallback, useContext, useMemo } from "react";
import type { CountryRef } from "@/wasm/wasm_eu5";
import { useEu5Engine, useEu5Players, useEu5SelectionState } from "../store";
import { useEu5SelectionTrigger } from "../features/profiles/useEu5Trigger";
import { countryProfileEntry, usePanelNav } from "../features/profiles/PanelNavContext";
import { usePanToEntity } from "../usePanToEntity";
import { useFrameSelection } from "./frameSelection";
import { isCountrySet } from "./selection";

const SelectedContext = createContext<readonly CountryRef[]>([]);

/**
 * Get the countries of a selection of several countries one time for the
 * whole column, largest first. The head, the caption, and the Compare
 * level read them from here. The Players preset gives the players'
 * countries, without their subjects. Other selections give no countries.
 */
export function SelectedCountriesProvider({ children }: { children: React.ReactNode }) {
  const selection = useEu5SelectionState();
  const players = useEu5Players();
  const set = isCountrySet(selection);
  const preset = selection?.preset === "players";
  const { data } = useEu5SelectionTrigger(
    (engine) =>
      set
        ? engine.queries.getDevelopmentInsight().then((x) => x.countries.map((r) => r.country))
        : Promise.resolve([]),
    [set],
  );

  const countries = useMemo(() => {
    if (!set) return [];
    const all = data ?? [];
    return preset ? all.filter((c) => players.some((p) => p.countryIdx === c.country.key)) : all;
  }, [data, set, preset, players]);

  return <SelectedContext.Provider value={countries}>{children}</SelectedContext.Provider>;
}

/** The countries of a selection of several countries, largest first */
export function useSelectedCountries(): readonly CountryRef[] {
  return useContext(SelectedContext);
}

/**
 * Open a country's profile so that the selection agrees with it. A country
 * that is in the selection opens on top of the path. Another country
 * becomes the selection, and its profile is the first level.
 */
export function useOpenCountry() {
  const engine = useEu5Engine();
  const nav = usePanelNav();
  const panToEntity = usePanToEntity();
  const frame = useFrameSelection();
  const selection = useEu5SelectionState();
  const selected = useSelectedCountries();

  return useCallback(
    (country: { idx: number; name: string; anchor: number }) => {
      const entry = countryProfileEntry(country.idx, country.name);
      const active = selection?.isEmpty ? undefined : selection?.activeProfile;
      const inSet = isCountrySet(selection) && selected.some((c) => c.country.key === country.idx);
      const same = active?.kind === "country" && active.country.key === country.idx;
      if (same) {
        // The first tab is this country's view.
        nav.popTo(0);
        panToEntity(country.anchor);
      } else if (inSet) {
        nav.open(entry);
        panToEntity(country.anchor);
      } else {
        // The first tab shows the country once it is selected.
        // The reader chose this country in the column, so the map shows all of it.
        void engine.commands.selectCountry(country.idx).then(frame);
      }
    },
    [engine, frame, nav, panToEntity, selection, selected],
  );
}

/** Add a country to the selection */
export function useAddCountry() {
  const engine = useEu5Engine();
  const frame = useFrameSelection();
  // An add asks to see the country with the others, so the map frames the set.
  return useCallback(
    (countryIdx: number) => {
      void engine.commands.addCountry(countryIdx).then(frame);
    },
    [engine, frame],
  );
}
