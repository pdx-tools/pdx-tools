import type React from "react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
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
  useEu5UserSelectionRevision,
} from "../store";
import { isHistoricalMapMode } from "../ui-engine";
import { useMapHistory } from "../history/context";
import { GameSegmented, GameSelect } from "../components";
import { CampaignStatus, SaveOverflowMenu } from "../control-panel/SaveMenu";
import { isTypingTarget } from "@/features/timeline/controller";
import { MODE_GROUPS, PARENT_MODES, parentOf } from "../control-panel/modeConfig";
import { Eu5ShortcutPanel } from "../Eu5ShortcutPanel";
import { SheetGrabber } from "./SheetGrabber";
import { MapKey } from "./MapKey";
import { ColumnSearch, SearchButton, useSearchShortcut } from "./ColumnSearch";
import type { SearchIntent } from "./ColumnSearch";
import { useOwnerBordersKey } from "./MapTools";
import { ShareMenu } from "./ShareMenu";
import { useFrameSelection } from "./frameSelection";
import { sectionLabel } from "@/components/game/SectionTitle";
import { AddCountryButton, IconTip, Swatch } from "./parts";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { useMapNamesKey } from "./MapLabels";
import { useFullView } from "./fullView";
import { useEu5Trigger } from "../features/profiles/useEu5Trigger";
import { useOpenCountry, useSelectedCountries } from "./selected";
import { displayTag, isCountrySet, selectedLineCount, selectionName } from "./selection";
import { ClearSelection, SelectedEntity } from "./SelectedEntity";
import { compareEntry, usePanelNav } from "../features/profiles/PanelNavContext";
import { useEu5MapHoverTarget } from "../useEu5MapHoverTarget";

/** When a control that had the focus is gone, the focus goes to the selection strip. */
export function rescueFocus() {
  // After the next render, when the control has gone.
  setTimeout(() => {
    if (document.activeElement !== document.body) return;
    document.querySelector<HTMLElement>("[data-column-focus]")?.focus({ preventScroll: true });
  }, 60);
}

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
  useMapNamesKey();
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
  const closeSearch = useCallback(() => {
    onSearch(null);
    rescueFocus();
  }, [onSearch]);
  useSearchShortcut(search !== null || !searchable, openSearch);
  const phone = !useBreakpoint("md");

  return (
    <div className="flex h-11 items-center gap-1 border-b border-game-line px-3.5 max-md:h-[45px] max-md:gap-0 max-md:px-0">
      {/* One width at each level, so the group stays in place when a level widens the column. */}
      <div className="flex min-w-0 flex-1 items-center gap-1 max-md:gap-0 md:max-w-[392px]">
        {search ? (
          <ColumnSearch key={search} intent={search} onClose={closeSearch} />
        ) : (
          <>
            <span className="min-w-0 flex-1 max-md:pl-2">
              <ModeMenu />
            </span>
            {phone ? null : <ModeVariants />}
            {searchable ? <SearchButton onOpen={openSearch} /> : null}
            {phone ? (
              <span className="flex shrink-0 items-center gap-1 pr-0.5">
                <ShareMenu className="max-md:h-9" />
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
 * The save actions at the end of the map row on a phone. The ⋯ menu has Melt and help.
 */
function PhoneSaveActions() {
  const menu = (openHelp?: () => void) => (
    <SaveOverflowMenu className="h-11 w-11" ownerBorders onHelp={openHelp} />
  );
  return <Eu5ShortcutPanel anchor={menu} />;
}

/** One place for a mode's views: beside the control that chose the mode */
function ModeVariants() {
  const mode = useEu5MapMode();
  const engine = useEu5Engine();
  const locked = useEu5Timelapse().status !== "idle";
  const parent = parentOf(mode);
  if (parent.variants.length < 2) return null;
  return (
    <GameSegmented
      aria-label={`${parent.label} view`}
      value={mode}
      onValueChange={(value) => void engine.trigger.selectMapMode(value as MapMode)}
      disabled={locked}
      className="shrink-0"
    >
      {parent.variants.map((v) => (
        <GameSegmented.Item key={v.value} value={v.value}>
          {v.label}
        </GameSegmented.Item>
      ))}
    </GameSegmented>
  );
}

/**
 * The mode switch. It names the open mode, and its list groups the modes
 * the game has; a mode's variants are a switch on its key.
 */
/** The key of a mode, when it has one */
const modeDigit = (key: string) => {
  const at = PARENT_MODES.findIndex((x) => x.key === key);
  return at >= 0 && at < 9 ? String(at + 1) : null;
};

function ModeMenu() {
  const engine = useEu5Engine();
  const mode = useEu5MapMode();
  const live = useEu5TimelineLive();
  const history = useMapHistory();
  // A recording drives the date from the campaign start to the save, so the
  // modes stand down until it is done rather than no-op under the pointer.
  const locked = useEu5Timelapse().status !== "idle";
  const parent = parentOf(mode);
  const choose = useCallback(
    (key: string) => {
      const next = PARENT_MODES.find((x) => x.key === key);
      if (!next || next.key === parent.key) return;
      void engine.trigger.selectMapMode(next.variants[0].value);
    },
    [engine, parent.key],
  );

  // The digits go to the modes in the order of the menu, from anywhere but a field.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      if (locked || isTypingTarget(event.target)) return;
      const next = /^[1-9]$/.test(event.key) ? PARENT_MODES[Number(event.key) - 1] : undefined;
      if (!next) return;
      event.preventDefault();
      choose(next.key);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [choose, locked]);

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
                {resets(m.variants[0].value) ? (
                  <span className="ml-2 font-game-num text-[12px] text-game-ink-500">
                    save date
                  </span>
                ) : null}
                {modeDigit(m.key) ? (
                  <span
                    aria-hidden
                    className="ml-auto pl-3 font-game-num text-[12px] text-game-ink-500"
                  >
                    {modeDigit(m.key)}
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

/**
 * Who the column and the map are about: everyone, the players, or the top great
 * powers. It stays when the map mode changes, because it is a selection.
 */
function ScopeSwitch() {
  const engine = useEu5Engine();
  const selection = useEu5SelectionState();
  const selected = useSelectedCountries();
  const multiplayer = useEu5Players().length > 1;
  const frame = useFrameSelection();
  const { data: labels } = useEu5Trigger((e) => e.queries.getRealmLabels(), []);
  const top = (labels?.labels ?? [])
    .filter((l) => l.greatPowerRank > 0 && l.greatPowerRank <= 10 && l.countryIdx !== undefined)
    .map((l) => l.countryIdx as number);
  const isTop =
    top.length > 1 &&
    selected.length === top.length &&
    selected.every((c) => top.includes(c.country.key));
  const value =
    selection == null || selection.isEmpty
      ? "all"
      : selection.preset === "players"
        ? "players"
        : isTop
          ? "top"
          : "";
  return (
    <GameSegmented
      aria-label="Scope"
      value={value}
      className="shrink-0"
      onValueChange={(next) => {
        if (next === "all") void engine.commands.clearSelection();
        if (next === "players") void engine.commands.selectPlayers().then(frame);
        if (next === "top") void engine.commands.selectCountries(top).then(frame);
      }}
    >
      <GameSegmented.Item value="all">All</GameSegmented.Item>
      {multiplayer ? <GameSegmented.Item value="players">Players</GameSegmented.Item> : null}
      <GameSegmented.Item value="top">Top 10</GameSegmented.Item>
    </GameSegmented>
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
/** From this many, a set of only players counts as the players less a few. */
const MANY_PLAYERS = 7;

function SelectionLine({ onCompare }: { onCompare: () => void }) {
  const selection = useEu5SelectionState();
  const revision = useEu5UserSelectionRevision();
  // A row or a result that made the selection can be gone now, with the focus in it.
  useEffect(() => {
    rescueFocus();
  }, [revision]);
  const countries = useSelectedCountries();
  const wide = useBreakpoint("md");
  const multiplayer = useEu5Players().length > 1;
  // A phone keeps the height for the rows, and only a multiplayer save needs its preset.
  if (selection == null || selection.isEmpty) {
    return wide || multiplayer ? <NoSelection /> : null;
  }

  const set = isCountrySet(selection) && countries.length > 1;
  // Players less a few is still about the players, so the scope stays and offers the way back.
  const customPlayers =
    multiplayer &&
    selection.preset !== "players" &&
    countries.length >= MANY_PLAYERS &&
    countries.every((c) => c.isPlayer);
  const chips = set && selection.preset !== "players" && !customPlayers;
  const name = selectionName(selection);
  const count = selectedLineCount(selection);
  const entity = selection.preset === "players" ? undefined : selection.activeProfile;

  if (entity) return <SelectedEntity profile={entity} note={count} onCompare={onCompare} />;

  return (
    <div
      role="group"
      aria-label="Selection"
      data-column-focus
      tabIndex={-1}
      className="flex min-h-8 items-center gap-2 border-b border-game-line bg-game-accent-soft pr-1.5 pl-3.5 outline-hidden max-md:min-h-11 max-md:gap-1 max-md:pr-0 max-md:pl-2"
    >
      {!chips || selected10(countries) ? <ScopeSwitch /> : null}
      {chips ? (
        <CountryChips countries={countries} />
      ) : (
        <>
          {/* The band says that this is the selection, so the name has the width, in full. */}
          <span className="shrink-0 text-[12px] leading-tight font-medium whitespace-nowrap text-game-accent-100">
            {selection.preset === "players"
              ? `${countries.length} players`
              : customPlayers
                ? `Custom (${countries.length})`
                : name}
          </span>
          {count !== null && selection.preset !== "players" && !customPlayers ? (
            <span className="min-w-0 truncate font-game-ui text-[12px] text-game-ink-300 tabular-nums">
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
/** A short set of chips leaves room for the scope switch */
const selected10 = (countries: readonly unknown[]) => countries.length === 10;

function NoSelection() {
  const full = useFullView().on;
  return (
    <div
      data-column-focus
      tabIndex={-1}
      className="flex min-h-9 items-center gap-2 border-b border-game-line px-3.5 outline-hidden max-md:min-h-11"
    >
      <ScopeSwitch />
      {/* The hint is about the map, so the full view has none. */}
      {full ? null : (
        <span className="ml-auto min-w-0 text-right text-[12px] leading-tight text-game-ink-500">
          Shift adds. Shift-drag: an area
        </span>
      )}
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
  Math.max(58, 44 + 7.3 * Math.max(0, ...countries.map((c) => chipLabel(c).length)));
/** A tag that the game generated says nothing to a reader, so the chip has the name's start. */
const chipLabel = (country: CountryRef) =>
  displayTag(country.tag) ?? country.country.name.slice(0, 6);

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
 * selection.
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
        <span className="font-game-ui text-[12px] text-game-ink-100">{chipLabel(country)}</span>
      </button>
      {/* The × is always in view, in its own slot, so a reader can see how to take a country out. */}
      <IconTip label={`Remove ${country.country.name}`}>
        <button
          type="button"
          onClick={() => void engine.commands.removeCountry(country.country.key)}
          aria-label={`Remove ${country.country.name} from the selection`}
          className={cx(
            "absolute top-1/2 right-0 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-control text-game-ink-300 hover:text-game-ink-100 max-md:h-11 max-md:w-11 tap:w-8 max-md:tap:w-11",
            focusRing,
          )}
        >
          <XMarkIcon className="h-3 w-3" />
        </button>
      </IconTip>
    </li>
  );
}
