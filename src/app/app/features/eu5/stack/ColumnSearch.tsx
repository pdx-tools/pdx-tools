import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import MagnifyingGlassIcon from "@heroicons/react/24/outline/MagnifyingGlassIcon";
import PlusIcon from "@heroicons/react/16/solid/PlusIcon";
import XMarkIcon from "@heroicons/react/16/solid/XMarkIcon";
import { Command as CommandPrimitive } from "cmdk";
import { cx } from "class-variance-authority";
import { focusRing, focusRingWithin } from "@/components/game/focusRing";
import { Kbd } from "@/components/game/Kbd";
import { formatInt } from "@/lib/format";
import { useEu5Engine } from "../store";
import { usePanToEntity } from "../usePanToEntity";
import { useFrameSelection } from "./MapTools";
import { resolveSearchSelection } from "../searchSelection";
import type { SearchResult } from "../ui-engine";
import { IconTip, Swatch } from "./parts";
import { displayTag } from "./selection";
import styles from "./ColumnSearch.module.css";

/** The tallest that the result list can be, before it stops on a whole row */
const LIST_MAX = 320;

/** Opens search on "/" unless the reader is typing somewhere else */
export function useSearchShortcut(active: boolean, open: () => void) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === "/" &&
        !active &&
        !(document.activeElement instanceof HTMLInputElement) &&
        !(document.activeElement instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        open();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, open]);
}

/**
 * Search as one control: the magnifier and "/" are in one filled field, with one
 * hover area. The hint has no keycap of its own, because a second shape read as a
 * second button. The field has no border, because the map select keeps the
 * strongest edge on the row.
 */
export function SearchButton({ onOpen }: { onOpen: () => void }) {
  return (
    <IconTip label="Search countries or locations (/)">
      <button
        type="button"
        onClick={onOpen}
        className={cx(
          "flex h-7 shrink-0 items-center justify-center gap-1 rounded-control bg-game-panel-2 px-1.5 text-game-ink-300 transition-colors hover:bg-game-panel-hover hover:text-game-ink-100 max-md:h-11 max-md:w-11 max-md:bg-transparent max-md:px-0",
          focusRing,
        )}
        aria-label="Search countries or locations"
      >
        <MagnifyingGlassIcon className="h-4 w-4" />
        <span aria-hidden className={"font-game-num text-[12px] leading-none max-md:hidden"}>
          /
        </span>
      </button>
    </IconTip>
  );
}

/** What search does with a country: select it, or add it to the selection */
export type SearchIntent = "select" | "add";

/** A name with the letters that match the query in bold */
function Matched({ name, query }: { name: string; query: string }) {
  const at = name.toLowerCase().indexOf(query.toLowerCase());
  if (at < 0 || query.length === 0) return <>{name}</>;
  return (
    <>
      {name.slice(0, at)}
      <b className="font-semibold text-game-ink-100">{name.slice(at, at + query.length)}</b>
      {name.slice(at + query.length)}
    </>
  );
}

/**
 * Search in the column head. It takes the whole row while it is open, and
 * its results float over the level below. To add a country, it lists only
 * countries and it stays open for the next one.
 */
export function ColumnSearch({ intent, onClose }: { intent: SearchIntent; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  // How many results the list shows before it scrolls.
  const [inView, setInView] = useState(0);
  // All of the matches. The list has the first of them.
  const [total, setTotal] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const engine = useEu5Engine();
  const panToEntity = usePanToEntity();
  const frameSelection = useFrameSelection();
  const searchQuery = query.trim();

  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!searchQuery) return;

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const found = await engine.queries.searchEntities(searchQuery);
        setResults(found.results);
        setTotal(found.total);
      } finally {
        setIsSearching(false);
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [engine, searchQuery]);

  // Shift, Ctrl, or Cmd with Enter or a click adds a country to the
  // selection. Search stays open, so the reader can add the next one.
  const adding = useRef(false);
  const handleAdd = useCallback(
    async (result: SearchResult) => {
      const selection = resolveSearchSelection(result);
      if (selection.kind !== "country") return;
      await engine.commands.addCountry(selection.countryIdx);
      frameSelection();
      setQuery("");
      setResults([]);
      setTotal(0);
      inputRef.current?.focus();
    },
    [engine, frameSelection],
  );

  const handleSelect = useCallback(
    async (result: SearchResult) => {
      const add = adding.current || intent === "add";
      adding.current = false;
      if (add && result.kind === "country") {
        await handleAdd(result);
        return;
      }
      const selection = resolveSearchSelection(result);
      if (selection.kind === "country") {
        await engine.commands.selectCountry(selection.countryIdx);
        frameSelection();
      } else {
        await engine.commands.setFocusedLocation(selection.locationIdx);
        panToEntity(selection.panTo);
      }
      onClose();
    },
    [engine, frameSelection, panToEntity, onClose, handleAdd, intent],
  );
  const noteModifier = (e: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => {
    adding.current = e.shiftKey || e.ctrlKey || e.metaKey;
  };

  const countryResults = useMemo(
    () => (searchQuery ? results.filter((r) => r.kind === "country") : []),
    [results, searchQuery],
  );
  const locationResults = useMemo(
    () => (searchQuery && intent !== "add" ? results.filter((r) => r.kind === "location") : []),
    [results, searchQuery, intent],
  );
  const hasResults = countryResults.length > 0 || locationResults.length > 0;
  // An add lists only countries, so its count is of those. The worker counts all of the matches.
  const matches = intent === "add" ? countryResults.length : total;
  const more = Math.max(0, matches - inView);
  const showDropdown = hasResults || (searchQuery.length > 0 && !isSearching);

  // The list stops on the end of a whole row, so no name is cut in half.
  const listRef = useRef<HTMLDivElement>(null);
  const measureMore = useCallback(() => {
    const list = listRef.current;
    if (!list) return;
    const end = list.getBoundingClientRect().bottom;
    const shown = [...list.querySelectorAll("[cmdk-item]")].filter(
      (item) => item.getBoundingClientRect().top < end - 2,
    );
    setInView(shown.length);
  }, []);
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const top = list.getBoundingClientRect().top;
    let fit = 0;
    for (const item of list.querySelectorAll("[cmdk-item]")) {
      const bottom = item.getBoundingClientRect().bottom - top;
      if (bottom > LIST_MAX) break;
      fit = bottom;
    }
    list.style.maxHeight = `${fit > 0 ? fit + 6 : LIST_MAX}px`;
    measureMore();
  }, [countryResults, locationResults, measureMore]);

  return (
    <CommandPrimitive
      shouldFilter={false}
      className="relative flex min-w-0 flex-1 items-center max-md:mx-2"
    >
      {/* A click away from the results closes search */}
      <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden />
      <div
        onClick={() => inputRef.current?.focus()}
        className={cx(
          "relative z-50 flex h-7 w-full items-center gap-2 rounded-control border border-game-control-line bg-game-page px-2 max-md:h-9",
          // On a phone a tap in the row's height goes to the field, as a target of 44px.
          "max-md:before:absolute max-md:before:inset-x-0 max-md:before:-inset-y-[5px]",
          focusRingWithin,
        )}
      >
        <MagnifyingGlassIcon aria-hidden className="h-3.5 w-3.5 shrink-0 text-game-ink-500" />
        <CommandPrimitive.Input
          ref={inputRef}
          value={query}
          onValueChange={setQuery}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              onClose();
            }
            if (e.key === "Enter") noteModifier(e);
          }}
          aria-label="Search countries or locations"
          placeholder={
            intent === "add" ? "Add a country to compare" : "Search countries or locations"
          }
          className="h-full min-w-0 flex-1 border-0 bg-transparent px-0 text-[12.5px] text-game-ink-100 outline-hidden placeholder:text-game-ink-500"
        />
        <Kbd className="tap:hidden">Esc</Kbd>
        {/* A touch screen has no Esc key, so it has a control in place of the hint. */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close search"
          className={cx(
            "relative -mr-2 hidden h-11 w-11 shrink-0 items-center justify-center text-game-ink-300 tap:flex",
            focusRing,
          )}
        >
          <XMarkIcon aria-hidden className="h-3.5 w-3.5" />
        </button>
      </div>

      {showDropdown && (
        <div className="absolute top-full right-0 left-0 z-50 mt-1.5">
          <div className="rounded-panel border border-game-line-strong bg-game-panel-2 shadow-[0_8px_24px_rgba(0,0,0,0.45)]">
            <CommandPrimitive.List
              ref={listRef}
              onScroll={measureMore}
              className="overflow-y-auto p-1.5"
            >
              <CommandPrimitive.Empty className="py-4 text-center text-xs text-game-ink-500">
                Nothing matches “{searchQuery}”
              </CommandPrimitive.Empty>

              {countryResults.length > 0 && (
                <CommandPrimitive.Group
                  heading="Countries"
                  className={cx("overflow-hidden", styles.searchGroup)}
                >
                  {countryResults.map((result) => (
                    <CommandPrimitive.Item
                      key={`country-${result.id}`}
                      onSelect={() => void handleSelect(result)}
                      onPointerDown={noteModifier}
                      className="group flex h-7 cursor-default items-center gap-2 rounded-plate pr-1 pl-2.5 text-[12.5px] text-game-ink-300 outline-hidden select-none aria-selected:bg-game-panel-hover aria-selected:text-game-ink-100 max-md:h-11"
                    >
                      <Swatch color={result.colorHex} />
                      <span className="min-w-0 truncate">
                        <Matched name={result.name} query={searchQuery} />
                      </span>
                      <span className="min-w-0 flex-1 font-game-ui text-[12px] whitespace-nowrap text-game-ink-500">
                        {displayTag(result.tag)}
                      </span>
                      <button
                        type="button"
                        tabIndex={-1}
                        aria-label={`Add ${result.name} to the selection`}
                        title="Add to selection (Shift+Enter)"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleAdd(result);
                        }}
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[2px] text-game-ink-500 hover:bg-game-panel-active hover:text-game-ink-100 max-md:h-11 max-md:w-11"
                      >
                        <PlusIcon aria-hidden className="h-3.5 w-3.5" />
                      </button>
                    </CommandPrimitive.Item>
                  ))}
                </CommandPrimitive.Group>
              )}

              {locationResults.length > 0 && (
                <CommandPrimitive.Group
                  heading="Locations"
                  className={cx("overflow-hidden", styles.searchGroup)}
                >
                  {locationResults.map((result) => (
                    <CommandPrimitive.Item
                      key={`location-${result.id}`}
                      onSelect={() => void handleSelect(result)}
                      className="flex h-7 cursor-default items-center gap-2 rounded-plate px-2.5 text-[12.5px] text-game-ink-300 outline-hidden select-none aria-selected:bg-game-panel-hover aria-selected:text-game-ink-100 max-md:h-11"
                    >
                      <Swatch color={result.ownerColorHex ?? null} />
                      <span className="min-w-0 truncate">
                        <Matched name={result.name} query={searchQuery} />
                      </span>
                      {displayTag(result.ownerTag) ? (
                        <span className="shrink-0 font-game-ui text-[12px] text-game-ink-500">
                          {result.ownerTag}
                        </span>
                      ) : null}
                    </CommandPrimitive.Item>
                  ))}
                </CommandPrimitive.Group>
              )}
            </CommandPrimitive.List>
            {hasResults ? (
              <p className="flex justify-between gap-2 border-t border-game-line px-2.5 py-1.5 text-[12px] text-game-ink-500">
                <span>
                  <span className="font-game-num tabular-nums">{formatInt(matches)}</span>{" "}
                  {matches === 1 ? "result" : "results"}
                  {more > 0 ? " · scroll for more" : null}
                </span>
                <span className="tap:hidden">
                  {intent === "add" ? "Enter adds · Esc closes" : "Enter selects · + adds"}
                </span>
                <span className="hidden tap:inline">
                  {intent === "add" ? "A tap adds · × closes" : "A tap selects · + adds"}
                </span>
              </p>
            ) : null}
          </div>
        </div>
      )}
    </CommandPrimitive>
  );
}
