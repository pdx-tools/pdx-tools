import type React from "react";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { cx } from "class-variance-authority";
import XMarkIcon from "@heroicons/react/16/solid/XMarkIcon";
import type { CountryRef, MapMode } from "@/wasm/wasm_eu5";
import { focusRing } from "@/components/game/focusRing";
import { CampaignSection } from "@/features/campaign/CampaignStepper";
import {
  useEu5Engine,
  useEu5MapMode,
  useEu5Players,
  useEu5SelectionState,
  useEu5Timelapse,
  useEu5TimelineLive,
} from "../store";
import { isHistoricalMapMode } from "../ui-engine";
import { useMapHistory } from "../history/context";
import { GameSelect } from "../components";
import { CampaignStatus, SaveOverflowMenu, SaveShareButton } from "../control-panel/SaveMenu";
import { MODE_GROUPS, PARENT_MODES, parentOf } from "../control-panel/modeConfig";
import { Eu5ShortcutPanel } from "../Eu5ShortcutPanel";
import { SheetGrabber } from "./SheetGrabber";
import { MapKey } from "./MapKey";
import { ColumnSearch, SearchButton, useSearchShortcut } from "./ColumnSearch";
import type { SearchIntent } from "./ColumnSearch";
import { ScreenshotButton, useOwnerBordersKey } from "./MapTools";
import { sectionLabel } from "@/components/game/SectionTitle";
import { AddCountryButton, IconTip, Swatch } from "./parts";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { useOpenCountry, useSelectedCountries } from "./selected";
import { isCountrySet, selectedLineCount, selectionName } from "./selection";
import { ClearSelection, SelectedEntity } from "./SelectedEntity";
import { compareEntry, usePanelNav } from "../features/profiles/PanelNavContext";
import { useEu5MapHoverTarget } from "../useEu5MapHoverTarget";

/**
 * The fixed top of the column: the map row, which says WHAT the map shows, and
 * the selection strip, which says WHERE or WHO. Both stay at each level. On a
 * phone the top row of the sheet also has the save and its actions.
 */
export function ColumnHead() {
  const preview = useMapHistory()?.preview;
  const wide = useBreakpoint("md");
  // The selection strip can open search to add a country, so search lives here.
  const [search, setSearch] = useState<SearchIntent | null>(null);
  useOwnerBordersKey();
  return (
    <div className="shrink-0">
      {!wide ? <SheetGrabber /> : null}
      {!wide && !preview ? <MapKey inSheet /> : null}
      <CampaignSection className="border-b border-game-line" />
      <CampaignStatus />
      <ModeBar searchable={!preview} search={search} onSearch={setSearch} />
      {!preview ? <SelectionLine onCompare={() => setSearch("add")} /> : null}
    </div>
  );
}

/**
 * The map row: the mode menu and search. A phone has no room for the map bar's
 * tools, so here the row also has Screenshot and the actions on the save.
 */
function ModeBar({
  searchable,
  search,
  onSearch,
}: {
  searchable: boolean;
  search: SearchIntent | null;
  onSearch: (search: SearchIntent | null) => void;
}) {
  const openSearch = useCallback(() => onSearch("select"), [onSearch]);
  const closeSearch = useCallback(() => onSearch(null), [onSearch]);
  useSearchShortcut(search !== null || !searchable, openSearch);
  const phone = !useBreakpoint("md");

  return (
    <div className="flex h-11 items-center gap-1 border-b border-game-line px-3.5 max-md:h-[45px] max-md:gap-0 max-md:px-0">
      {/* One width at each level, so the group stays in place when a level widens the column. */}
      <div className="flex min-w-0 flex-1 items-center gap-1 max-md:gap-0 md:w-[312px] md:flex-none">
        {search ? (
          <ColumnSearch key={search} intent={search} onClose={closeSearch} />
        ) : (
          <>
            <span className="min-w-0 flex-1 max-md:pl-2">
              <ModeMenu />
            </span>
            {searchable ? <SearchButton onOpen={openSearch} /> : null}
            {phone ? (
              <span className="flex shrink-0 items-center">
                <ScreenshotButton />
                <PhoneSaveActions />
              </span>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * The save actions at the end of the map row on a phone. Share shows when the player
 * can share. The ⋯ menu has Melt and help.
 */
function PhoneSaveActions() {
  const menu = (openHelp?: () => void) => (
    <SaveOverflowMenu className="h-11 w-11" ownerBorders onHelp={openHelp} />
  );
  return (
    <>
      <SaveShareButton />
      <Eu5ShortcutPanel anchor={menu} />
    </>
  );
}

/**
 * The mode switch. It names the open mode, and its list groups the modes
 * the game has; a mode's variants are a switch on its key.
 */
function ModeMenu() {
  const engine = useEu5Engine();
  const mode = useEu5MapMode();
  const live = useEu5TimelineLive();
  const history = useMapHistory();
  // A recording drives the date from the campaign start to the save, so the
  // modes stand down until it is done rather than no-op under the pointer.
  const locked = useEu5Timelapse().status !== "idle";
  const parent = parentOf(mode);
  const choose = (key: string) => {
    const next = PARENT_MODES.find((x) => x.key === key);
    if (!next || next.key === parent.key) return;
    void engine.trigger.selectMapMode(next.variants[0].value);
  };

  // Only borders have a history in the save, so the other modes show the save date.
  const resets = (value: MapMode) => !live && !history?.frames && !isHistoricalMapMode(value);

  return (
    <GameSelect value={parent.key} onValueChange={choose} disabled={locked}>
      <GameSelect.Trigger
        aria-label="Map mode"
        ring="keyboard"
        title={
          locked
            ? "A timelapse recording is using the map. Map modes come back when it finishes."
            : undefined
        }
        className="min-w-0 flex-1 border-game-control-line bg-game-panel hover:border-game-ink-500 hover:bg-game-panel-hover max-md:relative max-md:h-9 max-md:max-w-none max-md:px-2 max-md:before:absolute max-md:before:inset-x-0 max-md:before:-inset-y-[5px]"
      >
        <span className="flex min-w-0 items-baseline gap-2">
          <span className={cx(sectionLabel, "shrink-0 max-md:hidden")}>Map</span>
          <span className="truncate" title={parent.label}>
            <GameSelect.Value>{parent.label}</GameSelect.Value>
          </span>
        </span>
      </GameSelect.Trigger>
      <GameSelect.Content className="min-w-60">
        {MODE_GROUPS.map((group, i) => (
          <GameSelect.Group key={group.label}>
            {i > 0 ? <GameSelect.Separator /> : null}
            <GameSelect.Label>{group.label}</GameSelect.Label>
            {group.modes.map((m) => (
              <GameSelect.Item key={m.key} value={m.key}>
                <span>{m.label}</span>
                {m.variants.length > 1 ? (
                  <span className="ml-2 font-game-num text-[12px] text-game-ink-500">
                    {m.variants.length} views
                  </span>
                ) : null}
                {resets(m.variants[0].value) ? (
                  <span className="ml-2 font-game-num text-[12px] text-game-ink-500">
                    save date
                  </span>
                ) : null}
              </GameSelect.Item>
            ))}
          </GameSelect.Group>
        ))}
      </GameSelect.Content>
    </GameSelect>
  );
}

function PlayersButton({ label = "Players" }: { label?: string }) {
  const engine = useEu5Engine();
  const selection = useEu5SelectionState();
  // The preset compares players, so it is for multiplayer saves. In single
  // player the root level opens the player's country.
  const multiplayer = useEu5Players().length > 1;
  if (!multiplayer) return null;

  const on = selection?.preset === "players";
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => void engine.commands.selectPlayers()}
      className={cx(
        "h-6 shrink-0 rounded-control border px-1.5 font-game-ui text-[12px] whitespace-nowrap transition-colors max-md:relative max-md:h-8 max-md:px-2 max-md:before:absolute max-md:before:inset-x-0 max-md:before:-inset-y-1.5",
        focusRing,
        on
          ? "border-transparent bg-game-accent-soft text-game-accent-100"
          : "border-game-line-strong text-game-ink-100 hover:bg-game-panel-hover",
      )}
    >
      {label}
    </button>
  );
}

/**
 * WHERE or WHO: one strip under the map row, at each level. One entity is one
 * block with its identity (`SelectedEntity`). A set of countries has a chip for
 * each country: a click opens the country, and × removes it from the selection.
 * The chips that do not fit become one "+N" chip, which opens Compare. Any other
 * selection is one line with its name and its size. × is always at the end of the
 * strip and clears the selection; only Back leaves a level.
 *
 * Without a selection the strip says how to make one, so the place stays the same.
 */
function SelectionLine({ onCompare }: { onCompare: () => void }) {
  const selection = useEu5SelectionState();
  const countries = useSelectedCountries();
  const wide = useBreakpoint("md");
  const multiplayer = useEu5Players().length > 1;
  // A phone keeps the height for the rows, and only a multiplayer save needs its preset.
  if (selection == null || selection.isEmpty) {
    return wide || multiplayer ? <NoSelection /> : null;
  }

  const set = isCountrySet(selection) && countries.length > 1;
  const chips = set && selection.preset !== "players";
  const name = selectionName(selection);
  const count = selectedLineCount(selection);
  const entity = selection.preset === "players" ? undefined : selection.activeProfile;

  if (entity) return <SelectedEntity profile={entity} note={count} onCompare={onCompare} />;

  return (
    <div
      role="group"
      aria-label="Selection"
      className="flex min-h-8 items-center gap-2 border-b border-game-line bg-game-accent-soft pr-1.5 pl-3.5 max-md:min-h-11 max-md:gap-1 max-md:pr-0 max-md:pl-2"
    >
      {chips ? (
        <CountryChips countries={countries} />
      ) : (
        <>
          {/* The band says that this is the selection, so the name has the width, in full. */}
          <span className="min-w-0 text-[12px] leading-tight font-medium text-game-accent-100">
            {selection.preset === "players" ? `${countries.length} players` : name}
          </span>
          {count !== null ? (
            <span className="shrink-0 font-game-ui text-[12px] text-game-ink-300 tabular-nums">
              {count}
            </span>
          ) : null}
        </>
      )}
      <span className="ml-auto flex shrink-0 items-center gap-1">
        {set ? <AddCountryButton onClick={onCompare} title="Add a country" /> : null}
        <ClearSelection />
      </span>
    </div>
  );
}

/** The empty strip teaches that the map and the rows select. A multiplayer save also has its preset. */
function NoSelection() {
  return (
    <div className="flex min-h-8 items-center gap-2 border-b border-game-line px-3.5 max-md:min-h-11">
      <span className="min-w-0 text-[12px] leading-tight text-game-ink-500">
        <span className="max-md:hidden">Click</span>
        <span className="md:hidden">Tap</span> the map or a row to select
      </span>
      <span className="ml-auto shrink-0">
        <PlayersButton label="Select players" />
      </span>
    </div>
  );
}

/** The gap after a chip, so the line can count how many fit */
const CHIP_GAP = 4;
/**
 * The width of a chip, with 8px at each end. The first 24px is a slot that the swatch and × share,
 * so a pointer shows × without moving the tag. A touch screen has no hover and
 * a phone takes a touch, so that chip has a swatch, a tag, and a visible × with
 * 32px of its own. On a phone the chip and its × each have 44px.
 */
const chipWidth = "w-(--chip-width) tap:w-[69px] max-md:tap:w-[88px]";
/** A chip's width with a pointer. The longest tag decides it, so no tag is cut and the chips stay one width. */
const chipWidthFor = (countries: readonly CountryRef[]) =>
  Math.max(46, 24 + 7.3 * Math.max(0, ...countries.map((c) => c.tag.length)));

function CountryChips({ countries }: { countries: readonly CountryRef[] }) {
  const nav = usePanelNav();
  const phone = !useBreakpoint("md");
  const [chipsRef, fit] = useChipFit(countries.length);
  // On a phone the chips wrap, so each chip keeps its 44px ×.
  const overflow = !phone && countries.length > fit;
  const shown = overflow ? countries.slice(0, Math.max(0, fit - 1)) : countries;
  const hidden = countries.length - shown.length;

  return (
    <ul
      ref={chipsRef}
      aria-label="Selected countries"
      className={cx(
        "flex min-w-0 flex-1 items-center overflow-hidden",
        // On a phone each chip keeps its 44px ×, so the chips wrap. No chip of the set is out of view.
        "max-md:flex-wrap",
      )}
      style={
        { gap: CHIP_GAP, "--chip-width": `${chipWidthFor(countries)}px` } as React.CSSProperties
      }
    >
      {shown.map((x) => (
        <CountryChip key={x.country.key} country={x} />
      ))}
      {hidden > 0 ? (
        <li className={cx("shrink-0", chipWidth)}>
          <button
            type="button"
            onClick={() => nav.open(compareEntry)}
            title={countries
              .slice(shown.length)
              .map((x) => x.country.name)
              .join(", ")}
            className={cx(
              "flex h-6 w-full items-center justify-center rounded-control font-game-num text-[12px] text-game-ink-300 tabular-nums transition-colors hover:bg-game-panel-hover hover:text-game-ink-100 max-md:h-9",
              focusRing,
            )}
          >
            +{hidden}
          </button>
        </li>
      ) : null}
    </ul>
  );
}

/** How many chips fit in the measured width of the list */
function useChipFit(count: number) {
  const ref = useRef<HTMLUListElement>(null);
  const [fit, setFit] = useState(count);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const chip = el.firstElementChild?.getBoundingClientRect().width ?? 0;
      if (chip > 0)
        setFit(Math.max(1, Math.floor((el.clientWidth + CHIP_GAP) / (chip + CHIP_GAP))));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, fit] as const;
}

/**
 * One selected country. The chip is neutral: the line around it carries the
 * brass of the selection. A click opens the country; × removes it from the
 * selection. With a pointer, × shows on hover or focus. On a touch screen it
 * always shows.
 */
function CountryChip({ country }: { country: CountryRef }) {
  const engine = useEu5Engine();
  const openCountry = useOpenCountry();
  const hover = useEu5MapHoverTarget({ kind: "country", countryIdx: country.country.key });

  return (
    <li className={cx("group relative shrink-0", chipWidth)} {...hover}>
      <button
        type="button"
        onClick={() =>
          openCountry({
            idx: country.country.key,
            name: country.country.name,
            anchor: country.anchorLocationIdx,
          })
        }
        title={country.country.name}
        className={cx(
          "flex h-6 w-full items-center gap-1.5 rounded-control bg-game-panel/60 pl-1.5 transition-colors hover:bg-game-panel-hover max-md:h-11 tap:gap-[3px] tap:pl-0.5 max-md:tap:gap-1 max-md:tap:pl-1.5",
          focusRing,
        )}
      >
        <Swatch color={country.colorHex} size={8} />
        <span className="font-game-ui text-[12px] text-game-ink-100">{country.tag}</span>
      </button>
      {/* The × takes the swatch's slot while the chip has the pointer or the focus, so the tag stays whole. */}
      <IconTip label={`Remove ${country.country.name}`}>
        <button
          type="button"
          onClick={() => void engine.commands.removeCountry(country.country.key)}
          aria-label={`Remove ${country.country.name} from the selection`}
          className={cx(
            "absolute top-1/2 left-0 flex h-6 w-5 -translate-y-1/2 items-center justify-center rounded-control bg-game-panel-hover text-game-ink-300 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 hover:text-game-ink-100 focus-visible:opacity-100 max-md:h-11 max-md:w-11 tap:right-0 tap:left-auto tap:w-8 tap:bg-transparent tap:opacity-100 max-md:tap:w-11",
            focusRing,
          )}
        >
          <XMarkIcon className="h-3 w-3" />
        </button>
      </IconTip>
    </li>
  );
}
