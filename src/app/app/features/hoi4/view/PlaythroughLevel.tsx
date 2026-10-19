import { Band, Fact, Facts, LevelTitle, Note, microLabel } from "@/features/stack";
import { formatCount } from "./model";
import { useWorld } from "./context";

type Stats = Map<string, number>;

/** The chart Plate's categorical slots, in their fixed order */
const PLATE = [1, 2, 3, 4, 5, 6, 7].map((n) => `var(--game-chart-${n})`);

type Part = { key: string; label: string };

const PRODUCTION: { label: string; parts: Part[] }[] = [
  {
    label: "Military",
    parts: [
      { key: "military_production_equipment", label: "Equipment" },
      { key: "military_production_vehicles", label: "Vehicles" },
      { key: "military_production_air", label: "Aircraft" },
    ],
  },
  {
    label: "Air",
    parts: [
      { key: "air_production_fighter", label: "Fighter" },
      { key: "air_production_interceptor", label: "Interceptor" },
      { key: "air_production_cas", label: "Close air support" },
      { key: "air_production_tactical_bomber", label: "Tactical bomber" },
      { key: "air_production_strategic_bomber", label: "Strategic bomber" },
      { key: "air_production_naval_bomber", label: "Naval bomber" },
      { key: "air_production_scout_plane", label: "Scout plane" },
      { key: "air_production_maritime_patrol_plane", label: "Maritime patrol" },
      { key: "air_production_suicide", label: "Suicide craft" },
    ],
  },
  {
    label: "Tanks",
    parts: [
      { key: "tank_production_light", label: "Light" },
      { key: "tank_production_medium", label: "Medium" },
      { key: "tank_production_heavy", label: "Heavy" },
      { key: "tank_production_super_heavy", label: "Super-heavy" },
      { key: "tank_production_modern", label: "Modern" },
    ],
  },
  {
    label: "Naval",
    parts: [
      { key: "naval_production_submarine", label: "Submarine" },
      { key: "naval_production_screen", label: "Screen" },
      { key: "naval_production_capital_ship", label: "Capital ship" },
      { key: "naval_production_carrier", label: "Carrier" },
    ],
  },
];

const DOCTRINES: { label: string; parts: Part[] }[] = [
  {
    label: "Land",
    parts: [
      { key: "mobile_warfare_xp", label: "Mobile warfare" },
      { key: "superior_firepower_xp", label: "Superior firepower" },
      { key: "grand_battleplan_xp", label: "Grand battleplan" },
      { key: "mass_assault_xp", label: "Mass assault" },
    ],
  },
  {
    label: "Naval",
    parts: [
      { key: "fleet_in_being_xp", label: "Fleet in being" },
      { key: "trade_interdiction_xp", label: "Trade interdiction" },
      { key: "base_strike_xp", label: "Base strike" },
    ],
  },
  {
    label: "Air",
    parts: [
      { key: "strategic_destruction_xp", label: "Strategic destruction" },
      { key: "battlefield_support_xp", label: "Battlefield support" },
      { key: "operational_integrity_xp", label: "Operational integrity" },
    ],
  },
];

const FACTORY_ROWS = [
  { key: "civilian_factories_built", label: "Civilian" },
  { key: "military_factories_built", label: "Military" },
  { key: "dockyards_built", label: "Dockyard" },
  { key: "rocket_sites_built", label: "Rocket site" },
];
const ERAS = [
  { suffix: "1936", label: "Before 1940" },
  { suffix: "1940", label: "1940–44" },
  { suffix: "1945", label: "1945 on" },
];

const get = (stats: Stats, key: string) => stats.get(key) ?? 0;
const n = (x: number) => formatCount(x);

function duration(months: number) {
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const parts = [];
  if (years) parts.push(`${years} ${years === 1 ? "year" : "years"}`);
  if (rest || !years) parts.push(`${rest} ${rest === 1 ? "month" : "months"}`);
  return parts.join(" ");
}

/**
 * The game's end-of-campaign overview, which it shows only on exit, read from
 * the save at any date. It covers the whole campaign so far (factories built,
 * not held), so it does not repeat the country level.
 */
export function PlaythroughLevel({ tag }: { tag: string }) {
  const world = useWorld();
  const record = world.overview.playthroughs.find((x) => x.tag === tag);
  if (!record) {
    return <Note>The save keeps a playthrough record only for player countries.</Note>;
  }
  const stats = record.stats;
  const collected = world.overview.statisticsCollected;
  const yearsAtWar = get(stats, "hours_at_war") / 24 / 365;

  const groups = (spec: typeof PRODUCTION) =>
    spec
      .map((group) => ({
        ...group,
        parts: group.parts.map((p) => ({ ...p, value: get(stats, p.key) })),
      }))
      .filter((group) => group.parts.some((p) => p.value > 0));

  const naval = ["built_ships", "sunk_pride_of_the_fleet", "largest_navy"].some((k) =>
    get(stats, k),
  );

  return (
    <>
      <LevelTitle swatch={world.color(tag)} title={`${world.name(tag)}: playthrough record`} />
      {!collected ? (
        <Note>
          Partly collected. This save turned statistics collection off, and the time counters are
          not correct, so they are not shown. The other values are as the save keeps them.
        </Note>
      ) : null}
      <Facts>
        {collected ? (
          <>
            <Fact label="Time in game">{duration(get(stats, "game_months"))}</Fact>
            <Fact label="Hours played">{(get(stats, "seconds_played") / 3600).toFixed(1)}</Fact>
          </>
        ) : null}
        <Fact label="World conquered">{get(stats, "conquered_percentage")}%</Fact>
        <Fact label="Years at war">{yearsAtWar.toFixed(1)}</Fact>
      </Facts>

      <Band label="Battles" />
      <Facts>
        <Fact label="Offensive">{n(get(stats, "offensive_battles"))}</Fact>
        <Fact label="Defensive">{n(get(stats, "defensive_battles"))}</Fact>
        <Fact label="Total">{n(get(stats, "total_battles"))}</Fact>
        <Fact label="Against encircled">{n(get(stats, "battles_against_encircled"))}</Fact>
        <Fact label="With air support">{n(get(stats, "battles_with_air_support"))}</Fact>
        <Fact label="Longest battle">{get(stats, "longest_battle_duration")} days</Fact>
        <Fact label="Largest battle">{n(get(stats, "largest_manpower_battle"))} soldiers</Fact>
        <Fact label="Most tanks in one">{n(get(stats, "largest_tanks_battle"))}</Fact>
      </Facts>

      <Band label="Losses" />
      <Facts>
        <Fact label="Own casualties">
          {n(get(stats, "total_own_casualties") || get(stats, "own_casualties"))}
        </Fact>
        <Fact label="Enemy casualties">{n(get(stats, "enemy_casualties"))}</Fact>
        <Fact label="Most lost in one war">{n(get(stats, "highest_casualty_war"))}</Fact>
        <Fact label="Most inflicted in one war">{n(get(stats, "highest_enemy_casualty_war"))}</Fact>
        <Fact label="Provinces gained">{n(get(stats, "provinces_gained"))}</Fact>
        <Fact label="Provinces lost">{n(get(stats, "provinces_lost"))}</Fact>
      </Facts>

      <Band label="Peaks" />
      <Facts>
        <Fact label="Largest army">{n(get(stats, "largest_army"))} soldiers</Fact>
        {naval ? <Fact label="Largest navy">{n(get(stats, "largest_navy"))} ships</Fact> : null}
        <Fact label="Largest air force">{n(get(stats, "largest_airforce"))} planes</Fact>
      </Facts>

      <Band label="Feats" />
      <Facts>
        <Fact label="Nations liberated">{get(stats, "liberated_nations")}</Fact>
        <Fact label="Successful coups">{get(stats, "successful_coups")}</Fact>
        <Fact label="Aces shot down">{get(stats, "shot_aces")}</Fact>
        {naval ? (
          <Fact label="Prides of the Fleet sunk">{get(stats, "sunk_pride_of_the_fleet")}</Fact>
        ) : null}
        {naval ? <Fact label="Ships built">{n(get(stats, "built_ships"))}</Fact> : null}
        <Fact label="Tanks built">{n(get(stats, "built_tanks"))}</Fact>
      </Facts>

      <Band label="Factories built" />
      <FactoriesByEra stats={stats} />

      {groups(PRODUCTION).length ? (
        <>
          <Band label="Production mix" />
          <Note>
            Each bar is the split within its group. The units differ, so groups do not compare.
          </Note>
          {groups(PRODUCTION).map((group) => (
            <ShareBar key={group.label} label={group.label} parts={group.parts} />
          ))}
        </>
      ) : null}

      {groups(DOCTRINES).length ? (
        <>
          <Band label="Doctrine use" />
          {groups(DOCTRINES).map((group) => (
            <ShareBar key={group.label} label={group.label} parts={group.parts} />
          ))}
        </>
      ) : null}
    </>
  );
}

function FactoriesByEra({ stats }: { stats: Stats }) {
  return (
    <div className="border-b border-game-line px-3.5 py-2">
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr>
            <th className="text-left" />
            {ERAS.map((era) => (
              <th key={era.suffix} scope="col" className={`h-6 text-right ${microLabel}`}>
                {era.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {FACTORY_ROWS.map((row) => (
            <tr key={row.key}>
              <th scope="row" className="h-6 text-left font-normal text-game-ink-500">
                {row.label}
              </th>
              {ERAS.map((era) => {
                const value = get(stats, `${row.key}_${era.suffix}`);
                return (
                  <td
                    key={era.suffix}
                    className={`text-right font-game-num tabular-nums ${value ? "text-game-ink-100" : "text-game-ink-500"}`}
                  >
                    {value}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * One 100% bar. Slots follow the parts' fixed order, so a zero part keeps
 * its color out of use rather than passing it on. Past seven parts, the tail
 * folds into "Other".
 */
function ShareBar({ label, parts }: { label: string; parts: (Part & { value: number })[] }) {
  const slotted =
    parts.length > 7
      ? [
          ...parts.slice(0, 6),
          {
            key: "other",
            label: "Other",
            value: parts.slice(6).reduce((sum, p) => sum + p.value, 0),
          },
        ]
      : parts;
  const total = slotted.reduce((sum, p) => sum + p.value, 0);
  const shown = slotted
    .map((p, slot) => ({ ...p, color: PLATE[slot], share: total ? p.value / total : 0 }))
    .filter((p) => p.value > 0);

  return (
    <div className="grid gap-1.5 border-b border-game-line px-3.5 py-2.5">
      <span className="text-[12px] text-game-ink-300">{label}</span>
      <div
        className="flex h-2 gap-[2px] overflow-hidden rounded-[1px]"
        role="img"
        aria-label={`${label}: ${shown.map((p) => `${p.label} ${Math.round(p.share * 100)}%`).join(", ")}`}
      >
        {shown.map((p) => (
          <span key={p.key} style={{ flexGrow: p.share, background: p.color }} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-game-ink-500">
        {shown.map((p) => (
          <span key={p.key} className="inline-flex items-center gap-1.5">
            <span aria-hidden className="h-2 w-2 rounded-[1px]" style={{ background: p.color }} />
            {p.label}
            <span className="font-game-num text-game-ink-300 tabular-nums">
              {Math.round(p.share * 100)}%
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
