import React from "react";
import {
  Band,
  Fact,
  Facts,
  KindChips,
  LevelTitle,
  Meter,
  Note,
  Row,
  formatDay,
} from "@/features/stack";
import { hoi4 } from "../store";
import type { CountrySummary, Hoi4Event, MapMode } from "../worker/types";
import type { Entity } from "./model";
import { EVENT_KINDS, formatCount, lawName } from "./model";
import { useHoverOnly, useLink, useWorld } from "./context";

const muted = "text-game-ink-500";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** A country's name with its tag, when the tag adds something */
function CountryName({ c }: { c: CountrySummary }) {
  return <>{c.name}</>;
}

function countryRowTag(c: CountrySummary) {
  return c.name !== c.tag ? c.tag : undefined;
}

/** The key of the open map mode: what the colors mean, ranked */
export function RootLevel({ mode }: { mode: MapMode }) {
  const world = useWorld();
  const link = useLink();
  const { overview } = world;

  let body: React.ReactNode;
  if (mode === "political") {
    body = (
      <>
        <Band label="Countries" columns="Factories · Share" />
        {world.landed.slice(0, 12).map((c) => (
          <Row
            key={c.tag}
            swatch={c.color}
            name={<CountryName c={c} />}
            tag={countryRowTag(c)}
            value={c.factoriesHeld}
            dim={world.share(c.factoriesHeld)}
            {...link({ kind: "country", tag: c.tag })}
          />
        ))}
        <Row
          name={`All ${world.landed.length} countries`}
          tag="table"
          wide
          onOpen={() => link({ kind: "countryLedger" }).onOpen()}
        />
      </>
    );
  } else if (mode === "occupation") {
    const states = overview.occupations.reduce((sum, o) => sum + o.states.length, 0);
    body = overview.occupations.length ? (
      <>
        <Band label="Occupations" columns="States · Resist." />
        {overview.occupations.slice(0, 14).map((o, index) => (
          <Row
            key={index}
            swatch={world.color(o.occupier)}
            name={
              <>
                {world.name(o.occupier)} <span className={muted}>in</span> {world.name(o.occupied)}
              </>
            }
            value={o.states.length}
            dim={`${Math.round(o.resistance)}%`}
            {...link({ kind: "occupation", index })}
          />
        ))}
        <Row
          name={`All ${overview.occupations.length} occupations`}
          tag={`${states} states`}
          wide
          onOpen={() => link({ kind: "occupationLedger" }).onOpen()}
        />
      </>
    ) : (
      <Note>
        No country occupies another's land on {formatDay(overview.date)}. Occupations appear here
        once a war takes land, with their resistance and compliance.
      </Note>
    );
  } else if (mode === "factions") {
    const rows = [
      ...overview.factions.map((f, index) => ({ index, name: f.name, color: f.color })),
      { index: -1, name: "Not in a faction", color: "#5e5e5e" },
    ]
      .map((x) => {
        const countries = world.factionCountries(x.index);
        return { ...x, count: countries.length, factories: world.factories(countries) };
      })
      .filter((x) => x.count > 0)
      .sort((a, b) => b.factories - a.factories);
    body = (
      <>
        <Band label="Factions" columns="Members · Factories" />
        {rows.map((x) => (
          <Row
            key={x.index}
            swatch={x.color}
            name={x.name}
            value={x.count}
            dim={world.share(x.factories)}
            {...link({ kind: "faction", index: x.index })}
          />
        ))}
      </>
    );
  } else {
    const rows = overview.ideologies
      .map((x) => {
        const countries = world.ideologyCountries(x.key);
        return { ...x, count: countries.length, factories: world.factories(countries) };
      })
      .sort((a, b) => b.factories - a.factories);
    body = (
      <>
        <Band label="Governments" columns="Countries · Factories" />
        {rows.map((x) => (
          <Row
            key={x.key}
            swatch={x.color}
            name={x.name}
            value={x.count}
            dim={world.share(x.factories)}
            {...link({ kind: "ideology", key: x.key })}
          />
        ))}
      </>
    );
  }

  return (
    <>
      {body}
      <Records />
    </>
  );
}

/** The records of the whole save, under every key */
function Records() {
  const world = useWorld();
  const link = useLink();
  const { overview } = world;
  return (
    <>
      <Band label="Records" />
      <Row
        name="Chronology"
        tag={plural(overview.events.length, "event")}
        onOpen={() => link({ kind: "chronology" }).onOpen()}
      />
      {overview.wars.length ? (
        <Row
          name="War ledger"
          tag={plural(overview.wars.length, "pair")}
          wide
          onOpen={() => link({ kind: "warLedger" }).onOpen()}
        />
      ) : null}
      {overview.playthroughs.map((p) => (
        <Row
          key={p.tag}
          swatch={world.color(p.tag)}
          name="Playthrough record"
          tag={p.tag}
          {...link({ kind: "playthrough", tag: p.tag })}
        />
      ))}
    </>
  );
}

export function CountryLevel({ tag }: { tag: string }) {
  const world = useWorld();
  const link = useLink();
  const { overview } = world;
  const c = world.byTag.get(tag);
  if (!c) {
    return <Note>{tag} is not in this save.</Note>;
  }

  const faction = c.faction != null ? overview.factions[c.faction] : null;
  const popularity = c.popularity.filter((x) => x.popularity > 0);
  const events = overview.events.filter((e) => e.countries.includes(tag)).length;
  const record = overview.playthroughs.find((x) => x.tag === tag);
  const occupies = overview.occupations
    .map((o, index) => ({ o, index }))
    .filter((x) => x.o.occupier === tag);
  const occupiedBy = overview.occupations
    .map((o, index) => ({ o, index }))
    .filter((x) => x.o.occupied === tag);
  const wars = overview.wars
    .filter((w) => w.first === tag || w.second === tag)
    .map((w) => {
      const first = w.first === tag;
      return {
        enemy: first ? w.second : w.first,
        lost: first ? w.firstCasualties : w.secondCasualties,
        inflicted: first ? w.secondCasualties : w.firstCasualties,
        start: w.start,
      };
    })
    .sort((a, b) => b.lost + b.inflicted - (a.lost + a.inflicted));

  return (
    <>
      <LevelTitle swatch={c.color} title={c.name} tag={c.tag} />
      {c.originalTag && c.originalTag !== c.tag ? (
        <Note>
          A country that split from {world.name(c.originalTag)} in a civil war. The save gives it no
          name, so it takes the name the game gives {c.originalTag} under its ruling ideology.
        </Note>
      ) : null}
      <Facts>
        <Fact label="Government" text>
          {world.ideologyName(c.ideology)}
        </Fact>
        <Fact label="Factories held">
          {c.factoriesHeld}
          <span className={muted}> · {world.share(c.factoriesHeld)} of world</span>
          {c.factoriesHeld !== c.factoriesOwned ? (
            <span className={muted}> · owns {c.factoriesOwned}</span>
          ) : null}
        </Fact>
        <Fact label="States held">
          {c.statesHeld}
          {c.statesHeld !== c.statesOwned ? (
            <span className={muted}> · owns {c.statesOwned}</span>
          ) : null}
        </Fact>
        <Fact label="Stability">
          <Meter value={c.stability * 100} />
        </Fact>
        <Fact label="War support">
          <Meter value={c.warSupport * 100} />
        </Fact>
        {c.enemies.length ? (
          <Fact label="At war with">
            {c.enemies.length} {c.enemies.length === 1 ? "country" : "countries"}
          </Fact>
        ) : null}
        {c.casualties || c.enemyCasualties ? (
          <Fact label="Casualties">
            {formatCount(c.casualties)} <span className={muted}>lost ·</span>{" "}
            {formatCount(c.enemyCasualties)} <span className={muted}>inflicted</span>
          </Fact>
        ) : null}
        {c.shipsLost || c.shipsSunk ? (
          <Fact label="Ships">
            {c.shipsLost} <span className={muted}>lost ·</span> {c.shipsSunk}{" "}
            <span className={muted}>sunk</span>
          </Fact>
        ) : null}
        {c.capitulated ? <Fact label="Capitulated">{formatDay(c.capitulated)}</Fact> : null}
        {c.exileHost ? (
          <Fact label="In exile in" text>
            {world.name(c.exileHost)}
          </Fact>
        ) : null}
      </Facts>

      {popularity.length > 1 ? (
        <>
          <Band label="Party popularity" />
          <Facts>
            {popularity.map((x) => (
              <Fact key={x.ideology} label={world.ideologyName(x.ideology)}>
                <Meter value={x.popularity} />
              </Fact>
            ))}
          </Facts>
        </>
      ) : null}

      <Band label="Related" />
      {faction && c.faction != null ? (
        <Row
          swatch={faction.color}
          name={faction.name}
          tag={c.factionJoined ? `joined ${formatDay(c.factionJoined)}` : "faction"}
          value={faction.members.length}
          {...link({ kind: "faction", index: c.faction })}
        />
      ) : null}
      {c.ideology ? (
        <Row
          swatch={world.ideologyColor(c.ideology)}
          name={world.ideologyName(c.ideology)}
          tag="government"
          {...link({ kind: "ideology", key: c.ideology })}
        />
      ) : null}
      {events ? (
        <Row
          name="Chronology"
          tag={plural(events, "event")}
          {...link({ kind: "chronology", tag })}
        />
      ) : null}
      {record ? (
        <Row name="Playthrough record" tag="player" {...link({ kind: "playthrough", tag })} />
      ) : null}

      {wars.length ? (
        <>
          <Band label="Wars" columns="Lost · Inflicted" />
          {wars.slice(0, 10).map((w) => (
            <Row
              key={w.enemy}
              swatch={world.color(w.enemy)}
              name={world.name(w.enemy)}
              sub={`Since ${formatDay(w.start)}`}
              value={formatCount(w.lost)}
              dim={formatCount(w.inflicted)}
              {...link({ kind: "country", tag: w.enemy })}
            />
          ))}
          {wars.length > 10 ? (
            <Row
              name={`All ${wars.length} wars`}
              tag="table"
              wide
              onOpen={() => link({ kind: "warLedger", tag }).onOpen()}
            />
          ) : null}
        </>
      ) : null}

      {occupies.length ? (
        <>
          <Band label="Occupies" columns="States · Resist." />
          {occupies.map(({ o, index }) => (
            <Row
              key={index}
              swatch={world.color(o.occupied)}
              name={world.name(o.occupied)}
              value={o.states.length}
              dim={`${Math.round(o.resistance)}%`}
              {...link({ kind: "occupation", index })}
            />
          ))}
        </>
      ) : null}
      {occupiedBy.length ? (
        <>
          <Band label="Occupied by" columns="States · Resist." />
          {occupiedBy.map(({ o, index }) => (
            <Row
              key={index}
              swatch={world.color(o.occupier)}
              name={world.name(o.occupier)}
              value={o.states.length}
              dim={`${Math.round(o.resistance)}%`}
              {...link({ kind: "occupation", index })}
            />
          ))}
        </>
      ) : null}

      <Band label="Raw" />
      <Row
        name="Save variables"
        sub="The country's script variables, as the save writes them"
        {...link({ kind: "variables", tag })}
      />
    </>
  );
}

/** A faction or a government: its countries, largest industry first */
export function GroupLevel({
  entity,
}: {
  entity: Extract<Entity, { kind: "faction" | "ideology" }>;
}) {
  const world = useWorld();
  const link = useLink();
  const isFaction = entity.kind === "faction";
  const countries = isFaction
    ? world.factionCountries(entity.index)
    : world.ideologyCountries(entity.key);
  const factories = world.factories(countries);
  const faction = isFaction ? world.faction(entity.index) : null;
  const color = faction
    ? faction.color
    : world.ideologyColor(entity.kind === "ideology" ? entity.key : null);

  return (
    <>
      <LevelTitle swatch={color} title={world.label(entity)} />
      <Facts>
        <Fact label="Countries">{countries.length}</Fact>
        <Fact label="Factories held">
          {factories} <span className={muted}>· {world.share(factories)} of world</span>
        </Fact>
        {faction?.ideology ? (
          <Fact label="Ideology" text>
            {world.ideologyName(faction.ideology)}
          </Fact>
        ) : null}
      </Facts>
      {isFaction && entity.index >= 0 ? (
        <Row
          name="Member ledger"
          tag="table"
          wide
          onOpen={() => link({ kind: "memberLedger", index: entity.index }).onOpen()}
        />
      ) : null}
      <Band
        label={isFaction && entity.index >= 0 ? "Members" : "Countries"}
        columns={isFaction && entity.index >= 0 ? "Factories · Joined" : "Factories · Share"}
      />
      {countries.map((c) => (
        <Row
          key={c.tag}
          swatch={c.color}
          name={c.name}
          tag={countryRowTag(c)}
          value={c.factoriesHeld}
          dim={
            isFaction && entity.index >= 0
              ? c.factionJoined && c.factionJoined > world.overview.startDate
                ? c.factionJoined.slice(0, 4)
                : "start"
              : world.share(c.factoriesHeld)
          }
          {...link({ kind: "country", tag: c.tag })}
        />
      ))}
    </>
  );
}

export function OccupationLevel({ index }: { index: number }) {
  const world = useWorld();
  const link = useLink();
  const hoverOnly = useHoverOnly();
  const o = world.overview.occupations[index];
  const factories = o.states.reduce((sum, s) => sum + s.factories, 0);
  const occupied = world.byTag.get(o.occupied);

  return (
    <>
      <LevelTitle swatch={world.color(o.occupier)} title={world.occupationName(o)} />
      <Facts>
        <Fact label="States">{o.states.length}</Fact>
        <Fact label="Factories">{factories}</Fact>
        <Fact label="Resistance">
          <Meter value={o.resistance} />
        </Fact>
        <Fact label="Compliance">
          <Meter value={o.compliance} />
        </Fact>
        <Fact label="Occupation law" text>
          {lawName(o.law)}
        </Fact>
      </Facts>
      <Note>
        Factories counts the buildings in these states. How much of their output reaches the
        occupier depends on compliance, which the save does not resolve.
      </Note>
      <Band label="Countries" />
      <Row
        swatch={world.color(o.occupier)}
        name={world.name(o.occupier)}
        tag="occupier"
        {...link({ kind: "country", tag: o.occupier })}
      />
      {occupied ? (
        <Row
          swatch={occupied.color}
          name={occupied.name}
          tag="occupied"
          {...link({ kind: "country", tag: o.occupied })}
        />
      ) : (
        <Note>{world.name(o.occupied)} holds no land of its own.</Note>
      )}
      <Band label="States" columns="Factories" />
      {o.states.map((s) => (
        <Row
          key={s.id}
          swatch={null}
          name={s.name}
          value={s.factories || ""}
          {...hoverOnly(`state:${s.id}`, { countries: [], states: [s.id] })}
        />
      ))}
    </>
  );
}

export function EventLevel({ index }: { index: number }) {
  const world = useWorld();
  const link = useLink();
  const event = world.overview.events[index];
  const kind = EVENT_KINDS.find((x) => x.key === event.kind);
  const [first, ...rest] = event.countries;
  const wars =
    event.kind === "war"
      ? world.overview.wars.filter(
          (w) =>
            w.start === event.date &&
            ((w.first === first && rest.includes(w.second)) ||
              (w.second === first && rest.includes(w.first))),
        )
      : [];

  return (
    <>
      <LevelTitle title={world.describe(event)} />
      <Facts>
        <Fact label="Date">{formatDay(event.date)}</Fact>
        <Fact label="Kind" text>
          {kind?.short}
        </Fact>
      </Facts>
      {wars.length ? (
        <>
          <Band
            label="Casualties in this war so far"
            columns={`${world.name(first)} · Other side`}
          />
          {wars.map((w) => {
            const other = w.first === first ? w.second : w.first;
            const own = w.first === first ? w.firstCasualties : w.secondCasualties;
            const theirs = w.first === first ? w.secondCasualties : w.firstCasualties;
            return (
              <Row
                key={other}
                swatch={world.color(other)}
                name={`vs ${world.name(other)}`}
                value={formatCount(own)}
                dim={formatCount(theirs)}
                {...link({ kind: "country", tag: other })}
              />
            );
          })}
        </>
      ) : null}
      <Band label="Countries" />
      {[...new Set(event.countries)].map((tag) =>
        world.byTag.has(tag) ? (
          <Row
            key={tag}
            swatch={world.color(tag)}
            name={world.name(tag)}
            {...link({ kind: "country", tag })}
          />
        ) : (
          <Note key={tag}>{world.name(tag)} no longer exists in this save.</Note>
        ),
      )}
    </>
  );
}

export function ChronologyLevel({
  tag,
  from,
  to,
}: {
  tag?: string;
  /** The period that the time bar opened, which the list marks */
  from?: string;
  to?: string;
}) {
  const world = useWorld();
  const kinds = hoi4.useKinds();
  const { toggleKind } = hoi4.useActions();
  const link = useLink();
  const listRef = React.useRef<HTMLDivElement>(null);
  const all = world.overview.events;
  const country = tag ? world.byTag.get(tag) : null;
  const shown = all
    .map((event, index) => ({ event, index }))
    .filter((x) => kinds.has(x.event.kind) && (!tag || x.event.countries.includes(tag)))
    .reverse();
  const counts = Object.fromEntries(
    EVENT_KINDS.map((k) => [
      k.key,
      all.filter((e) => e.kind === k.key && (!tag || e.countries.includes(tag))).length,
    ]),
  ) as Record<Hoi4Event["kind"], number>;

  React.useEffect(() => {
    listRef.current?.querySelector("[data-at]")?.scrollIntoView({ block: "center" });
  }, [from]);

  return (
    <>
      <LevelTitle
        swatch={country ? country.color : undefined}
        title={country ? `${country.name}: chronology` : "Chronology"}
      />
      <KindChips
        label="Event kinds"
        kinds={EVENT_KINDS}
        on={kinds}
        counts={counts}
        onToggle={toggleKind}
      />
      {shown.length === 0 ? (
        <Note>
          No wars, capitulations, faction joins, or capital ship losses by{" "}
          {formatDay(world.overview.date)}.
        </Note>
      ) : null}
      <div ref={listRef}>
        {shown.map(({ event, index }) => {
          const props = link({ kind: "event", index });
          const inBin = from != null && to != null && event.date >= from && event.date < to;
          return (
            <EventRow
              key={index}
              event={event}
              text={world.describe(event)}
              mark={inBin}
              {...props}
            />
          );
        })}
      </div>
    </>
  );
}

function EventRow({
  event,
  text,
  hot,
  mark,
  onOpen,
  onHover,
}: {
  event: Hoi4Event;
  text: string;
  hot: boolean;
  mark: boolean;
  onOpen: () => void;
  onHover: (on: boolean) => void;
}) {
  const kind = EVENT_KINDS.find((x) => x.key === event.kind);
  return (
    <button
      type="button"
      data-at={mark ? "" : undefined}
      onClick={onOpen}
      onPointerEnter={() => onHover(true)}
      onPointerLeave={() => onHover(false)}
      onFocus={() => onHover(true)}
      onBlur={() => onHover(false)}
      className={
        "grid w-full cursor-pointer grid-cols-[74px_minmax(0,1fr)] items-baseline gap-2.5 border-b border-game-line px-3.5 py-1.5 text-left hover:bg-game-panel-hover focus-visible:inset-ring-1 focus-visible:inset-ring-game-accent-focus focus-visible:outline-hidden " +
        (hot || mark ? "bg-game-panel-hover" : "")
      }
    >
      <span className="font-game-num text-[11px] text-game-ink-500 tabular-nums">
        {formatDay(event.date)}
      </span>
      <span className="text-[12.5px] leading-snug text-game-ink-100">
        <span className="mr-1.5 font-game-num text-[9.5px] font-medium tracking-[0.14em] text-game-ink-500 uppercase">
          {kind?.short}
        </span>
        {text}
      </span>
    </button>
  );
}
