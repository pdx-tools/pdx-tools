import { cx } from "class-variance-authority";
import { focusRing } from "@/components/game/focusRing";
import { formatCount, formatExact, formatMetric } from "@/lib/format";
import type {
  ActiveProfileIdentity,
  CountryRef,
  EntityHeader,
  LocationProfile,
} from "@/wasm/wasm_eu5";
import { EntityName } from "../components/EntityName";
import { Eu5Flag } from "../components/flags/Eu5Flag";
import { formatLegendValue } from "../control-panel/Legend/GradientLegend";
import { HeadlineStats } from "../features/profiles/ProfileTitle";
import { useEu5Trigger } from "../features/profiles/useEu5Trigger";
import {
  useEu5ChosenHome,
  useEu5Engine,
  useEu5MapMode,
  useEu5Players,
  useSetEu5ChosenHome,
} from "../store";
import { usePanToEntity } from "../usePanToEntity";
import { useEu5MapHoverTarget } from "../useEu5MapHoverTarget";
import { AddCountryButton, ExactValue, IconTip, Stat, Swatch, usePlayerName } from "./parts";
import { useDatedCountry } from "./datedCountry";
import { displayTag } from "./selection";

/**
 * Clears the selection, in a word: a × on a chip removes that one country, so a
 * second × for the whole set says less. It is at the end of the selection strip, at
 * each level. Only Back leaves a level. The icon's end is on the 14px gutter line, so
 * its target goes past that line when its parent ends 6px from the edge (`pr-1.5`).
 */
export function ClearSelection({ className }: { className?: string }) {
  const engine = useEu5Engine();
  const multiplayer = useEu5Players().length > 1;
  return (
    <IconTip label="Clear selection">
      <button
        type="button"
        // The default scope of a group's save is the players.
        onClick={() =>
          void (multiplayer ? engine.commands.selectPlayers() : engine.commands.clearSelection())
        }
        aria-label="Clear selection"
        className={cx(
          "flex h-6 shrink-0 items-center justify-center rounded-control px-1.5 font-game-ui text-[12px] text-game-ink-300 transition-colors hover:bg-game-panel-hover hover:text-game-ink-100 max-md:h-11 max-md:px-2.5",
          focusRing,
          className,
        )}
      >
        Clear
      </button>
    </IconTip>
  );
}

/** The header of the selected entity, as the level below it also loads it */
function useSelectedHeader(profile: ActiveProfileIdentity) {
  const key =
    profile.kind === "country"
      ? profile.country.key
      : profile.kind === "market"
        ? profile.market.key
        : profile.location.key;
  return useEu5Trigger(
    async (engine): Promise<EntityHeader | LocationProfile | null> => {
      if (profile.kind === "country") {
        return (await engine.queries.getCountryProfile(key))?.header ?? null;
      }
      if (profile.kind === "market") {
        return (await engine.queries.getMarketProfile(key))?.header ?? null;
      }
      return (await engine.queries.getLocationProfile(key)) ?? null;
    },
    [profile.kind, key],
  ).data;
}

/** A location's headline figures, with their full values on hover and on focus */
function LocationFigures({ profile }: { profile: LocationProfile }) {
  const { development, population, control } = profile.stats;
  return (
    <ExactValue
      exact={`${formatExact(development)} Dev · ${formatExact(population)} Pop · ${formatExact(control * 100)}% Control`}
      className="flex w-fit flex-wrap items-baseline gap-x-2.5"
    >
      <Stat label="Dev" value={formatMetric(development)} />
      <Stat label="Pop" value={formatCount(population)} />
      <Stat label="Control" value={formatLegendValue("control", control)} />
    </ExactValue>
  );
}

function isLocationProfile(x: EntityHeader | LocationProfile): x is LocationProfile {
  return "stats" in x;
}

/** The country that owns a selected location, with its flag. A click goes up to it. */
function ParentLink({ owner }: { owner: CountryRef }) {
  const engine = useEu5Engine();
  const panToEntity = usePanToEntity();
  const hover = useEu5MapHoverTarget({ kind: "country", countryIdx: owner.country.key });
  return (
    <button
      type="button"
      onClick={() => {
        void engine.commands.selectCountry(owner.country.key);
        panToEntity(owner.anchorLocationIdx);
      }}
      {...hover}
      className={cx(
        "flex shrink-0 cursor-pointer items-center gap-2 rounded-[1px] max-md:min-h-11",
        focusRing,
      )}
    >
      <Eu5Flag
        flag={owner.flag}
        colorHex={owner.colorHex}
        size="sm"
        alt=""
        className="shrink-0 rounded-[2px] border border-game-rim"
      />
      <EntityName className="text-[14px] leading-tight font-medium">
        {owner.country.name}
      </EntityName>
    </button>
  );
}

/** A group's save does not say which player reads it, so the reader says so. */
function ThisIsMe({ countryIdx }: { countryIdx: number }) {
  const chosen = useEu5ChosenHome();
  const choose = useSetEu5ChosenHome();
  const mine = chosen === countryIdx;
  return (
    <button
      type="button"
      aria-pressed={mine}
      title={mine ? "Your country in this campaign. A click takes this off." : undefined}
      onClick={() => choose(mine ? null : countryIdx)}
      className={cx(
        "h-6 shrink-0 cursor-pointer rounded-control border border-game-control-line px-1.5 font-game-ui text-[12px] hover:bg-game-panel-hover max-md:h-11",
        mine ? "text-game-accent-100" : "text-game-ink-100",
        focusRing,
      )}
    >
      {mine ? "You" : "This is me"}
    </button>
  );
}

/**
 * One selected entity, on one line of one height at each level, so that the tabs under
 * it keep their place: the mark (a flag for a country, a swatch for another kind), the
 * name and the tag. A location names its owner first, as a link with the owner's flag.
 * At the end are the actions: Add for a country, then Clear. The list has the figures.
 */
export function SelectedEntity({
  profile,
  note,
  onCompare,
}: {
  profile: ActiveProfileIdentity;
  /** Says that the entity has no land on this date */
  note: string | null;
  onCompare?: () => void;
}) {
  const data = useSelectedHeader(profile);
  const liveHeader = data && !isLocationProfile(data) ? data : null;
  const dated = useDatedCountry(profile.kind === "country" ? profile.country.key : null);
  const header =
    liveHeader && dated
      ? {
          ...liveHeader,
          name: dated.name,
          tag: dated.tag,
          flag: dated.flag,
          colorHex: dated.colorHex,
        }
      : liveHeader;
  const location = data && isLocationProfile(data) ? data : null;
  const owner = location?.header.owner;

  const fallback =
    profile.kind === "country"
      ? profile.country.name
      : profile.kind === "market"
        ? profile.market.name
        : profile.location.name;
  const name = header?.name ?? location?.header.location.name ?? fallback;
  // The owner's name is on the line, so a location does not also have the owner's tag.
  const tag = displayTag(header?.tag);
  const color = header?.colorHex ?? owner?.colorHex ?? null;

  const player = usePlayerName(profile.kind === "country" ? profile.country.key : undefined);
  const mode = useEu5MapMode();
  const flag = header?.tag ? header : null;
  const mark = flag ? (
    <Eu5Flag
      flag={flag.flag}
      colorHex={flag.colorHex}
      size="xs"
      alt=""
      className="shrink-0 rounded-[2px] border border-game-rim"
    />
  ) : data && !(profile.kind === "market" && mode === "markets") ? (
    // The markets mode paints a selected market by its access, so its swatch would not match.
    <Swatch color={color} size={12} />
  ) : null;

  const tagNode = tag ? (
    <span className="shrink-0 font-game-ui text-[12px] text-game-ink-500">{tag}</span>
  ) : null;
  const playerNode = player ? (
    <span className="shrink-0 font-game-ui text-[12px] text-game-ink-300">{player}</span>
  ) : null;

  const ownerFirst = profile.kind === "location" && owner;

  return (
    <div
      data-column-focus
      tabIndex={-1}
      className="flex min-h-8 items-center gap-2 border-b border-game-line bg-game-accent-soft pr-1.5 pl-3.5 outline-hidden max-md:min-h-11 max-md:pr-0"
    >
      {ownerFirst ? (
        <>
          <ParentLink owner={owner} />
          {/* The slash means "in". */}
          <span aria-hidden className="shrink-0 text-[13px] leading-tight text-game-ink-500">
            /
          </span>
        </>
      ) : (
        mark
      )}
      <span className="min-w-0 text-[13px] leading-tight font-medium text-game-accent-100">
        {name}
      </span>
      {tagNode}
      {playerNode}
      {note ? <span className="shrink-0 text-[12px] text-game-ink-300">{note}</span> : null}
      {player && profile.kind === "country" ? <ThisIsMe countryIdx={profile.country.key} /> : null}
      <span className="ml-auto flex shrink-0 items-center gap-1 max-md:gap-0">
        {profile.kind === "country" && onCompare ? (
          <AddCountryButton onClick={onCompare} title="Add a country to compare with this one" />
        ) : null}
        <ClearSelection />
      </span>
    </div>
  );
}

/** The headline figures of the selected entity, under the heading of its list */
export function SelectedFigures({ profile }: { profile: ActiveProfileIdentity }) {
  const data = useSelectedHeader(profile);
  if (!data) return null;
  return (
    <div className="px-3.5 pb-1">
      {isLocationProfile(data) ? (
        <LocationFigures profile={data} />
      ) : (
        <HeadlineStats header={data} />
      )}
    </div>
  );
}
