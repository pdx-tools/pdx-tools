import { LevelTable, Meter, Swatch, formatDay } from "@/features/stack";
import type { Column } from "@/features/stack";
import { hoi4 } from "../store";
import type { CountrySummary, OccupationSummary, WarSummary } from "../worker/types";
import type { Entity } from "./model";
import { entityKey, formatCount, lawName } from "./model";
import { useWorld } from "./context";

function NameCell({ color, name }: { color: string | null; name: string }) {
  return (
    <span className="inline-flex items-center gap-2 font-game-ui text-game-ink-100">
      <Swatch color={color} />
      {name}
    </span>
  );
}

/** Rows that open their entity and light its land, as list rows do */
function useTableLinks<T>(entityOf: (row: T) => Entity) {
  const world = useWorld();
  const { open, setHover } = hoi4.useActions();
  const hotKey = hoi4.useHoverKey();
  return {
    rowKey: (row: T) => entityKey(entityOf(row)),
    hoverKey: (row: T) => entityKey(entityOf(row)),
    hotKey,
    onOpen: (row: T) => open(entityOf(row)),
    onHover: (row: T | null) => {
      if (row === null) {
        setHover(null);
      } else {
        const entity = entityOf(row);
        setHover({ key: entityKey(entity), match: world.mapMatch(entity) });
      }
    },
  };
}

export function CountryLedger({ faction }: { faction?: number }) {
  const world = useWorld();
  const links = useTableLinks<CountrySummary>((c) => ({ kind: "country", tag: c.tag }));
  const members = faction !== undefined;
  const rows = members ? world.factionCountries(faction) : world.landed;

  const columns: Column<CountrySummary>[] = [
    {
      key: "name",
      label: "Country",
      text: true,
      render: (c) => <NameCell color={c.color} name={c.name} />,
      sort: (c) => c.name,
    },
    {
      key: "government",
      label: "Government",
      text: true,
      render: (c) => world.ideologyName(c.ideology),
      sort: (c) => world.ideologyName(c.ideology),
    },
    members
      ? {
          key: "joined",
          label: "Joined",
          render: (c) =>
            c.factionJoined && c.factionJoined > world.overview.startDate
              ? formatDay(c.factionJoined)
              : "At start",
          sort: (c) => c.factionJoined ?? "",
        }
      : {
          key: "faction",
          label: "Faction",
          text: true,
          render: (c) => (c.faction != null ? world.overview.factions[c.faction].name : "None"),
          sort: (c) => (c.faction != null ? world.overview.factions[c.faction].name : "~"),
        },
    {
      key: "factories",
      label: "Factories",
      render: (c) => c.factoriesHeld,
      sort: (c) => c.factoriesHeld,
    },
    {
      key: "owned",
      label: "Owned",
      render: (c) => c.factoriesOwned,
      sort: (c) => c.factoriesOwned,
    },
    {
      key: "states",
      label: "States",
      render: (c) => c.statesHeld,
      sort: (c) => c.statesHeld,
    },
    {
      key: "stability",
      label: "Stability",
      render: (c) => <Meter value={c.stability * 100} />,
      sort: (c) => c.stability,
    },
    {
      key: "warSupport",
      label: "War support",
      render: (c) => <Meter value={c.warSupport * 100} />,
      sort: (c) => c.warSupport,
    },
    {
      key: "lost",
      label: "Lost",
      render: (c) => (c.casualties ? formatCount(c.casualties) : "–"),
      sort: (c) => c.casualties,
    },
    {
      key: "inflicted",
      label: "Inflicted",
      render: (c) => (c.enemyCasualties ? formatCount(c.enemyCasualties) : "–"),
      sort: (c) => c.enemyCasualties,
    },
  ];

  return (
    <LevelTable
      label={members ? "Member ledger" : "Country ledger"}
      columns={columns}
      rows={rows}
      {...links}
    />
  );
}

type IndexedOccupation = OccupationSummary & { index: number; factories: number };

export function OccupationLedger() {
  const world = useWorld();
  const links = useTableLinks<IndexedOccupation>((o) => ({ kind: "occupation", index: o.index }));
  const rows = world.overview.occupations.map((o, index) => ({
    ...o,
    index,
    factories: o.states.reduce((sum, s) => sum + s.factories, 0),
  }));

  const columns: Column<IndexedOccupation>[] = [
    {
      key: "occupier",
      label: "Occupier",
      text: true,
      render: (o) => <NameCell color={world.color(o.occupier)} name={world.name(o.occupier)} />,
      sort: (o) => world.name(o.occupier),
    },
    {
      key: "occupied",
      label: "Occupied",
      text: true,
      render: (o) => world.name(o.occupied),
      sort: (o) => world.name(o.occupied),
    },
    {
      key: "states",
      label: "States",
      render: (o) => o.states.length,
      sort: (o) => o.states.length,
    },
    { key: "factories", label: "Factories", render: (o) => o.factories, sort: (o) => o.factories },
    {
      key: "resistance",
      label: "Resistance",
      render: (o) => <Meter value={o.resistance} />,
      sort: (o) => o.resistance,
    },
    {
      key: "compliance",
      label: "Compliance",
      render: (o) => <Meter value={o.compliance} />,
      sort: (o) => o.compliance,
    },
    {
      key: "law",
      label: "Law",
      text: true,
      render: (o) => lawName(o.law),
      sort: (o) => lawName(o.law),
    },
  ];

  return <LevelTable label="Occupation ledger" columns={columns} rows={rows} {...links} />;
}

type WarRow = WarSummary & { side: string; enemy: string; lost: number; inflicted: number };

/**
 * Every pair of countries at war, with the casualties of each side. The
 * game shows the totals of a war, not who took them from whom.
 */
export function WarLedger({ tag }: { tag?: string }) {
  const world = useWorld();
  const links = useTableLinks<WarRow>((w) => ({ kind: "country", tag: tag ? w.enemy : w.side }));
  const rows: WarRow[] = world.overview.wars
    .filter((w) => !tag || w.first === tag || w.second === tag)
    .map((w) => {
      const flip = tag !== undefined && w.second === tag;
      return {
        ...w,
        side: flip ? w.second : w.first,
        enemy: flip ? w.first : w.second,
        lost: flip ? w.secondCasualties : w.firstCasualties,
        inflicted: flip ? w.firstCasualties : w.secondCasualties,
      };
    })
    .sort((a, b) => b.lost + b.inflicted - (a.lost + a.inflicted));

  const columns: Column<WarRow>[] = [
    ...(tag
      ? []
      : [
          {
            key: "side",
            label: "Country",
            text: true,
            render: (w: WarRow) => (
              <NameCell color={world.color(w.side)} name={world.name(w.side)} />
            ),
            sort: (w: WarRow) => world.name(w.side),
          },
        ]),
    {
      key: "enemy",
      label: tag ? "Enemy" : "At war with",
      text: true,
      render: (w) => <NameCell color={world.color(w.enemy)} name={world.name(w.enemy)} />,
      sort: (w) => world.name(w.enemy),
    },
    { key: "since", label: "Since", render: (w) => formatDay(w.start), sort: (w) => w.start },
    {
      key: "lost",
      label: "Losses",
      render: (w) => formatCount(w.lost),
      sort: (w) => w.lost,
    },
    {
      key: "inflicted",
      label: "Inflicted",
      render: (w) => formatCount(w.inflicted),
      sort: (w) => w.inflicted,
    },
    {
      key: "instigator",
      label: "Started by",
      text: true,
      render: (w) => world.name(w.instigator),
      sort: (w) => world.name(w.instigator),
    },
  ];

  return (
    <LevelTable
      label="War ledger"
      columns={columns}
      rows={rows}
      {...links}
      rowKey={(w) => `${w.first}:${w.second}`}
    />
  );
}
