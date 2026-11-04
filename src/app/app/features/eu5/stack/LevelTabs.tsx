import { cx } from "class-variance-authority";
import { focusRing } from "@/components/game/focusRing";
import { parentOf } from "../control-panel/modeConfig";
import {
  compareEntry,
  countryProfileEntry,
  locationProfileEntry,
  marketProfileEntry,
  usePanelNav,
} from "../features/profiles/PanelNavContext";
import type { PanelNavEntry } from "../features/profiles/PanelNavContext";
import { useEu5MapMode, useEu5SelectionState } from "../store";
import { useSelectedCountries } from "./selected";
import { insightLabel, isCountrySet } from "./selection";

/**
 * HOW DEEP, as the third row of one control model. The map row says WHAT, the
 * strip says WHO, and these tabs name each level that the selection has, at rest.
 * A level has one way in. The tabs have stable names and one order, so a tab keeps
 * its place when the mode or the selection changes. The heading says what the list is.
 */
export function LevelTabs({ action }: { action?: React.ReactNode }) {
  const nav = usePanelNav();
  const mode = useEu5MapMode();
  const selection = useEu5SelectionState();
  const countries = useSelectedCountries();
  const data = insightLabel(parentOf(mode).label);
  const profile = selection?.preset === "players" ? undefined : selection?.activeProfile;
  const set = isCountrySet(selection) && countries.length > 1;

  const entry: PanelNavEntry | null = profile
    ? profile.kind === "country"
      ? countryProfileEntry(profile.country.key, profile.country.name)
      : profile.kind === "market"
        ? marketProfileEntry(profile.market.key, profile.market.name)
        : locationProfileEntry(profile.location.key, profile.location.name)
    : null;

  const first = nav.path[0];
  const tabs: { label: string; entry: PanelNavEntry | null; on: boolean }[] = [
    { label: "List", entry: null, on: first === undefined },
    ...(entry
      ? [
          {
            label: "Profile",
            entry,
            on: first?.kind === "profile" || first?.kind === "focus" || first?.kind === "section",
          },
        ]
      : []),
    ...(set ? [{ label: "Compare", entry: compareEntry, on: first?.kind === "compare" }] : []),
    { label: data, entry: { kind: "insight", label: data }, on: first?.kind === "insight" },
  ];

  return (
    <nav
      aria-label="Levels"
      className="flex h-9 shrink-0 items-stretch gap-3 border-b border-game-line pr-1.5 pl-3.5"
    >
      {tabs.map((tab) => (
        <button
          key={tab.label}
          type="button"
          aria-current={tab.on ? "page" : undefined}
          onClick={() => {
            nav.popTo(0);
            if (tab.entry) nav.open(tab.entry);
          }}
          className={cx(
            // The hit area goes past the row on a phone, over the band under it, which takes no input.
            "relative -mb-px cursor-pointer border-b-2 font-game-ui text-[12.5px] whitespace-nowrap transition-colors max-md:after:absolute max-md:after:inset-x-0 max-md:after:-bottom-1 max-md:after:h-1",
            tab.on
              ? "border-game-accent-100 font-medium text-game-ink-100"
              : "border-transparent text-game-ink-300 hover:text-game-ink-100",
            focusRing,
          )}
        >
          {tab.label}
        </button>
      ))}
      {action ? <span className="ml-auto flex items-center pr-1.5">{action}</span> : null}
    </nav>
  );
}
