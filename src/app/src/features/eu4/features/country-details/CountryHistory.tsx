import { memo, useCallback, useMemo, useRef } from "react";
import { CountryDetails } from "../../types/models";
import { useEu4Worker } from "../../worker";
import {
  CountryHistoryEvent,
  CountryHistoryYear,
  LeaderKind,
  LocalizedTag,
  WarBattles,
} from "../../../../../../wasm-eu4/pkg/wasm_eu4";
import { Alert } from "@/components/Alert";
import { Card } from "@/components/Card";
import {
  FlagAvatar,
  FlagAvatarCore,
  PersonalityAvatar,
} from "../../components/avatars";
import {
  AdminManaFocusedIcon,
  AdminManaIcon,
  AdmiralIcon,
  AttritionLossesIcon,
  CapitalIcon,
  ConquistadorIcon,
  CultureIcon,
  DecisionIcon,
  DiplomaticManaFocusedIcon,
  DiplomaticManaIcon,
  ExplorerIcon,
  GeneralIcon,
  HeavyShipIcon,
  HeirIcon,
  InfantryIcon,
  MilitaryManaFocusedIcon,
  MilitaryManaIcon,
  ModifierIcon,
  PeaceIcon,
  PolicyIcon,
  QueenIcon,
  ReligionIcon,
  RulerIcon,
  WarIcon,
} from "../../components/icons";
import { AdvisorImage } from "../../components/AdvisorImage";
import { LeaderStats } from "../../components/LeaderStats";
import { Losses, expandLosses } from "../../utils/losses";
import {
  abbreviateInt,
  formatInt,
  pluralize,
  sentenceCasing,
} from "@/lib/format";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEu4Actions, useEu4Meta, useSelectedDate } from "../../store";
import { MapIcon, EyeSlashIcon } from "@heroicons/react/24/outline";
import { FunnelIcon } from "@heroicons/react/16/solid";
import { IconButton } from "@/components/IconButton";
import { cx } from "class-variance-authority";
import { Button } from "@/components/Button";
import { create } from "zustand";

const CountryHistoryCard = ({
  country,
  evt,
}: {
  country: LocalizedTag;
  evt: CountryHistoryEvent;
}) => {
  switch (evt.event.kind) {
    case "annexed":
      return <Card className="flex items-center gap-4 p-4">Annexed</Card>;
    case "appeared":
      return <Card className="flex items-center gap-4 p-4">Appeared</Card>;
    case "initial":
      return (
        <Card className="flex items-center gap-4 p-4">
          <FlagAvatarCore size="small" tag={evt.event.tag} />
          <p>
            Started as {evt.event.name} ({evt.event.tag})
          </p>
        </Card>
      );
    case "tagSwitch":
      return (
        <Card>
          <div className="flex px-2 pt-0.5">
            <div className="grow font-semibold text-xs text-gray-400/75">
              {evt.date}
            </div>
            <HistoryIcons evt={evt} />
          </div>
          <div className="flex items-center gap-4 px-4 pb-4">
            <FlagAvatarCore size="small" tag={evt.event.tag} />
            <p>
              Tag switched to {evt.event.name} ({evt.event.tag})
            </p>
          </div>
        </Card>
      );
    case "capital":
      return (
        <Card>
          <div className="flex px-2 pt-0.5">
            <div className="grow font-semibold text-xs text-gray-400/75">
              {evt.date}
            </div>
            <HistoryIcons evt={evt} />
          </div>
          <div className="flex items-center gap-4 px-4 pb-4">
            <CapitalIcon />
            <p>
              Changed capital to {evt.event.name} ({evt.event.id})
            </p>
          </div>
        </Card>
      );
    case "addAcceptedCulture":
      return (
        <Card>
          <div className="flex px-2 pt-0.5">
            <div className="grow font-semibold text-xs text-gray-400/75">
              {evt.date}
            </div>
            <HistoryIcons evt={evt} />
          </div>
          <div className="flex items-center gap-4 px-4 pb-4">
            <CultureIcon />

            <p>Accepted culture: {evt.event.name}</p>
          </div>
        </Card>
      );
    case "primaryCulture":
      return (
        <Card>
          <div className="flex px-2 pt-0.5">
            <div className="grow font-semibold text-xs text-gray-400/75">
              {evt.date}
            </div>
            <HistoryIcons evt={evt} />
          </div>
          <div className="flex items-center gap-4 px-4 pb-4">
            <CultureIcon />

            <p>Primary culture: {evt.event.name}</p>
          </div>
        </Card>
      );
    case "removeAcceptedCulture":
      return (
        <Card>
          <div className="flex px-2 pt-0.5">
            <div className="grow font-semibold text-xs text-gray-400/75">
              {evt.date}
            </div>
            <HistoryIcons evt={evt} />
          </div>
          <div className="flex items-center gap-4 px-4 pb-4">
            <CultureIcon />
            <p>Removed accepted culture: {evt.event.name}</p>
          </div>
        </Card>
      );
    case "changeStateReligion":
      return (
        <Card>
          <div className="flex px-2 pt-0.5">
            <div className="grow font-semibold text-xs text-gray-400/75">
              {evt.date}
            </div>
            <HistoryIcons evt={evt} />
          </div>
          <div className="flex items-center gap-4 px-4 pb-4">
            <ReligionIcon />
            <p>State religion changed to {evt.event.name}</p>
          </div>
        </Card>
      );
    case "flag":
      return (
        <Card>
          <div className="flex px-2 pt-0.5">
            <div className="grow font-semibold text-xs text-gray-400/75">
              {evt.date}
            </div>
            <HistoryIcons evt={evt} />
          </div>
          <div className="flex items-center gap-4 px-4 pb-4">
            <ModifierIcon />
            <p>{evt.event.name}</p>
          </div>
        </Card>
      );
    case "decision":
      return (
        <Card>
          <div className="flex px-2 pt-0.5">
            <div className="grow font-semibold text-xs text-gray-400/75">
              {evt.date}: enacted decision
            </div>
            <HistoryIcons evt={evt} />
          </div>
          <div className="flex items-center gap-4 px-4 pb-4">
            <DecisionIcon />
            <p>{sentenceCasing(evt.event.id.replaceAll("_", " "))}</p>
          </div>
        </Card>
      );
    case "greatAdvisor":
      return (
        <Card>
          <div className="flex px-2 pt-0.5">
            <div className="grow font-semibold text-xs text-gray-400/75">
              {evt.date}
            </div>
            <HistoryIcons evt={evt} />
          </div>
          <div className="flex items-center gap-4 px-4 pb-4">
            <AdvisorImage
              id={evt.event.occupation.id}
              className="h-8 w-8"
              alt=""
            />
            <p>{evt.event.occupation.name} great advisor event</p>
          </div>
        </Card>
      );
    case "leader":
      return (
        <Card>
          <div className="flex px-2 pt-0.5">
            <div className="grow font-semibold text-xs text-gray-400/75">
              {evt.date}
            </div>
            <HistoryIcons evt={evt} />
          </div>
          <div className="flex items-center gap-4 px-4 pb-4">
            <div className="self-start">
              <LeaderKindIcon kind={evt.event.leaders[0].kind} />
            </div>
            <div>
              {evt.event.leaders.map((x, i) => (
                <div key={i} className="flex gap-2">
                  <LeaderStats {...x} />
                  <div>
                    <div>{x.name}</div>
                    <div className="font-semibold text-xs text-gray-400/75">
                      {x.personality?.name
                        .replace("_personality", "")
                        .replaceAll("_", " ")}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      );
    case "monarch":
      return (
        <Card className="pb-4">
          <div className="flex px-2 pt-0.5">
            <div className="grow font-semibold text-xs text-gray-400/75">
              {evt.date}:{" "}
              {(() => {
                switch (evt.event.type) {
                  case "monarch":
                    return "a new ruler has ascended the throne!";
                  case "heir":
                    return "a new heir has appeared!";
                  case "queen":
                    return "we have a new queen!";
                  case "consort":
                    return "a consort has appeared!";
                }
              })()}
            </div>
            <HistoryIcons evt={evt} />
          </div>
          <div className="flex items-start gap-4 px-4">
            {(() => {
              switch (evt.event.type) {
                case "monarch":
                  return <RulerIcon />;
                case "heir":
                  return <HeirIcon />;
                case "queen":
                case "consort":
                  return <QueenIcon />;
              }
            })()}

            <div>
              <div className="flex flex-col gap-1 min-w-48">
                <div>
                  {evt.event.name} {evt.event.dynasty}
                </div>
                <div className="flex gap-2">
                  <div className="flex gap-1">
                    <AdminManaIcon /> <span>{evt.event.adm}</span>
                  </div>
                  <div className="flex gap-1">
                    <DiplomaticManaIcon /> <span>{evt.event.dip}</span>
                  </div>
                  <div className="flex gap-1">
                    <MilitaryManaIcon /> <span>{evt.event.mil}</span>
                  </div>
                </div>
                <div className="flex">
                  {evt.event.personalities.map((personality) => (
                    <PersonalityAvatar
                      key={personality.id}
                      {...personality}
                      size={42}
                    />
                  ))}
                </div>
              </div>
            </div>
            <div className="pl-4 flex flex-col gap-1">
              <div>Age: {evt.event.age}</div>
              <div>Culture: {evt.event.culture?.name}</div>
              <div>Religion: {evt.event.religion?.name}</div>
            </div>
          </div>
          {evt.event.leader ? (
            <div className="pl-4 flex gap-4">
              <div className="self-start">
                <LeaderKindIcon kind={evt.event.leader.kind} />
              </div>
              <div className="flex flex-col">
                <LeaderStats {...evt.event.leader} />
                <div className="font-semibold text-xs text-gray-400/75">
                  {evt.event.leader.personality?.name
                    .replace("_personality", "")
                    .replaceAll("_", " ")}
                </div>
                {evt.event.leader.activation ? (
                  <div className="font-semibold text-xs text-gray-400/75">
                    Commandant since {evt.event.leader.activation}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </Card>
      );
    case "warStart": {
      const event = evt.event;
      return (
        <Card>
          <div className="flex px-2 pt-0.5">
            <div className="grow font-semibold text-xs text-gray-400/75">
              {evt.date}: <WarStartHeader date={evt.date} event={event} />{" "}
              {event.is_active ? "(ongoing)" : ""}
            </div>
            <HistoryIcons evt={evt} />
          </div>
          <div className="flex items-center gap-4 px-4 pb-4">
            <div className="flex self-start">
              <WarIcon />
            </div>
            <div className="flex flex-col gap-2">
              <div>{evt.event.war}</div>
              <div className="flex gap-8 flex-wrap">
                <div className="flex flex-col">
                  <div className="text-sm font-semibold">Attackers</div>
                  {evt.event.is_active ? (
                    <SideCasualties
                      losses={expandLosses(evt.event.attacker_losses)}
                    />
                  ) : null}
                  <div className="flex flex-wrap w-44">
                    {evt.event.attackers.map((x) => (
                      <FlagAvatar
                        key={x.tag}
                        condensed={true}
                        static
                        name={x.name}
                        tag={x.tag}
                        size="xs"
                      />
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-sm font-semibold">Defenders</div>
                  {evt.event.is_active ? (
                    <SideCasualties
                      losses={expandLosses(evt.event.defender_losses)}
                    />
                  ) : null}
                  <div className="flex flex-wrap w-44">
                    {evt.event.defenders.map((x) => (
                      <FlagAvatar
                        key={x.tag}
                        condensed={true}
                        static
                        name={x.name}
                        tag={x.tag}
                        size="xs"
                      />
                    ))}
                  </div>
                </div>
                {evt.event.is_active ? (
                  <div>
                    <div>
                      <span className="text-sm font-semibold">
                        {country.name}
                      </span>{" "}
                      <span className="no-break font-semibold text-xs text-gray-400/75">
                        (participation:{" "}
                        {formatInt(evt.event.our_participation_percent * 100)}%)
                      </span>
                    </div>
                    <SideCasualties
                      losses={expandLosses(evt.event.our_losses)}
                    />
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </Card>
      );
    }
    case "warEnd": {
      const losses = expandLosses(evt.event.our_losses);
      const attackingLosses = expandLosses(evt.event.attacker_losses);
      const defendingLosses = expandLosses(evt.event.defender_losses);

      const warStatus = evt.event.war_end
        ? `ended on ${evt.event.war_end}`
        : "is ongoing";
      return (
        <Card>
          <div className="flex px-2 pt-0.5">
            <div className="grow font-semibold text-xs text-gray-400/75">
              {evt.date}: {evt.event.war_end != evt.date ? "Separate" : ""}{" "}
              peace after {formatInt(evt.event.our_duration_days)} days
              {evt.event.war_end != evt.date
                ? `. War ${warStatus} after ${formatInt(
                    evt.event.war_duration_days,
                  )} days of conflict`
                : ""}
            </div>

            <HistoryIcons evt={evt} />
          </div>
          <div className="flex items-center gap-4 px-4 pb-4">
            <div className="flex self-start">
              <PeaceIcon />
            </div>
            <div className="flex flex-col gap-2">
              <div>{evt.event.war}</div>
              <div className="flex gap-8 flex-wrap">
                <div>
                  <div className="text-sm font-semibold">Attackers</div>
                  <SideCasualties losses={attackingLosses} />
                </div>
                <div>
                  <div className="text-sm font-semibold">Defenders</div>
                  <SideCasualties losses={defendingLosses} />
                </div>
                <div>
                  <div>
                    <span className="text-sm font-semibold">
                      {country.name}
                    </span>{" "}
                    <span className="no-break font-semibold text-xs text-gray-400/75">
                      (participation:{" "}
                      {formatInt(evt.event.our_participation_percent * 100)}%)
                    </span>
                  </div>
                  <SideCasualties losses={losses} />
                </div>
              </div>
              <div>
                <WarBattlesSummary
                  is_attacking={evt.event.is_attacking}
                  battles={evt.event.land_battles}
                  type="Land"
                />
                <WarBattlesSummary
                  is_attacking={evt.event.is_attacking}
                  battles={evt.event.naval_battles}
                  type="Naval"
                />
              </div>
            </div>
          </div>
        </Card>
      );
    }
    case "enactedPolicy":
      return (
        <Card>
          <div className="flex px-2 pt-0.5">
            <div className="grow font-semibold text-xs text-gray-400/75">
              {evt.date}: enacted policy
            </div>
            <HistoryIcons evt={evt} />
          </div>
          <div className="flex items-center gap-4 px-4 pb-4">
            <PolicyIcon />
            <p>{sentenceCasing(evt.event.name.replaceAll("_", " "))}</p>
          </div>
        </Card>
      );
    case "focus":
      return (
        <Card>
          <div className="flex px-2 pt-0.5">
            <div className="grow font-semibold text-xs text-gray-400/75">
              {evt.date}: changed national focus
            </div>
            <HistoryIcons evt={evt} />
          </div>
          <div className="flex items-center gap-4 px-4 pb-4">
            <NationalFocusIcon focus={evt.event.focus} />
            <p>
              {evt.event.focus == "none" ? "Removed focus" : evt.event.focus}
            </p>
          </div>
        </Card>
      );
  }
};

const HistoryIcons = ({ evt }: { evt: CountryHistoryEvent }) => {
  return (
    <div className="flex gap-2">
      <HistoryMapIcon evt={evt} />
      <HistoryFilterIcon evt={evt} />
    </div>
  );
};

function eventToFilter(evt: CountryHistoryEvent) {
  switch (evt.event.kind) {
    case "annexed":
    case "appeared":
    case "initial":
    case "flag":
    case "decision":
      return evt.event.kind;
    case "tagSwitch":
      return "tag switch";
    case "capital":
      return "change capital";
    case "addAcceptedCulture":
      return "add accepted culture";
    case "removeAcceptedCulture":
      return "remove accepted culture";
    case "primaryCulture":
      return "change primary culture";
    case "changeStateReligion":
      return "change state religion";
    case "greatAdvisor":
      return "great advisor";
    case "leader": {
      switch (evt.event.leaders[0].kind) {
        case "Admiral":
          return "admirals";
        case "General":
          return "generals";
        case "Explorer":
          return "explorers";
        case "Conquistador":
          return "conquistadors";
      }
    }
    case "monarch": {
      switch (evt.event.type) {
        case "monarch":
          return "ruler";
        case "heir":
        case "queen":
        case "consort":
          return evt.event.type;
      }
    }
    case "warStart":
      return "start of war";
    case "warEnd":
      return "peace";
    case "enactedPolicy":
      return "enacted policy";
    case "focus":
      return "change national focus";
  }
}

const HistoryFilterIcon = ({ evt }: { evt: CountryHistoryEvent }) => {
  const actions = useFilterActions();
  const filterName = eventToFilter(evt);
  return (
    <IconButton
      side="left"
      className="pt-1 group"
      variant="ghost"
      shape="none"
      tooltip={`Hide similar events (${filterName})`}
      onClick={() => {
        actions.addFilter(filterName);
      }}
      icon={
        <EyeSlashIcon className="h-6 w-6 hover:opacity-100 transition-opacity opacity-50" />
      }
    />
  );
};

const HistoryMapIcon = ({ evt }: { evt: CountryHistoryEvent }) => {
  const actions = useEu4Actions();
  const date = useSelectedDate();
  const meta = useEu4Meta();

  return (
    <IconButton
      side="left"
      className="pt-1 group"
      variant="ghost"
      shape="none"
      onClick={() =>
        date.text != evt.date
          ? actions.setSelectedDateText(evt.date)
          : actions.setSelectedDateText(meta.date)
      }
      tooltip={
        date.text != evt.date
          ? `Set map date to ${evt.date}`
          : `Reset date to ${meta.date}`
      }
      icon={
        <MapIcon
          className={cx(
            "h-6 w-6 hover:opacity-100 transition-opacity",
            date.text != evt.date && "opacity-50",
          )}
        />
      }
    />
  );
};

const WarBattlesSummary = ({
  is_attacking,
  battles,
  type,
}: {
  is_attacking: boolean;
  battles: WarBattles;
  type: "Land" | "Naval";
}) => {
  if (battles.count == 0) {
    return null;
  }

  return (
    <div className="font-semibold text-xs text-gray-400/75">
      {type} battles: {formatInt(battles.count)}. The{" "}
      {is_attacking ? "attackers" : "defenders"} won{" "}
      {pluralize("battle", battles.won)}.
      {battles.battle_ground ? (
        <>
          {" "}
          {pluralize("battle", battles.battle_ground.battles)} fought over{" "}
          {battles.battle_ground.name} ({battles.battle_ground.id}) with{" "}
          <span className="all-small-caps">
            {abbreviateInt(battles.battle_ground.total_casualties)}
          </span>{" "}
          total {type == "Land" ? "losses" : "sunk"}.
        </>
      ) : null}
    </div>
  );
};

const NationalFocusIcon = ({ focus }: { focus: string }) => {
  switch (focus) {
    case "ADM":
      return <AdminManaFocusedIcon />;
    case "DIP":
      return <DiplomaticManaFocusedIcon />;
    case "MIL":
      return <MilitaryManaFocusedIcon />;
    case "none":
      return <AdminManaIcon />;
    default:
      return null;
  }
};

const WarStartHeader = ({
  date,
  event,
}: CountryHistoryEvent & { event: { kind: "warStart" } }) => {
  if (event.is_war_leader) {
    return event.is_attacking ? "declared war" : "led defense of";
  }

  let result = "joined";
  if (event.war_start != date) {
    result += ` after the war started in ${event.war_start}`;
  }

  return result;
};

const LeaderKindIcon = ({ kind }: { kind: LeaderKind }) => {
  switch (kind) {
    case "Admiral":
      return <AdmiralIcon />;
    case "Conquistador":
      return <ConquistadorIcon />;
    case "Explorer":
      return <ExplorerIcon />;
    case "General":
      return <GeneralIcon />;
  }
};

const SideCasualties = ({ losses }: { losses: Losses }) => {
  return (
    <div className="flex gap-2 w-44 justify-between">
      <div className="flex items-end">
        <span className="all-small-caps">
          {abbreviateInt(losses.landTotal)}
        </span>
        <InfantryIcon alt="Battles + attrition losses" />
      </div>
      <div className="flex items-end">
        <span className="all-small-caps">
          {abbreviateInt(losses.landTotalAttrition)}
        </span>
        <AttritionLossesIcon />
      </div>
      <div className="flex items-end">
        <span className="all-small-caps">
          {abbreviateInt(losses.navyTotal)}
        </span>
        <HeavyShipIcon alt="Ships lost" />
      </div>
    </div>
  );
};

const FilterOverlay = () => {
  const showFilter = useShowFilter();
  const actions = useFilterActions();

  if (!showFilter) {
    return null;
  }

  return (
    <div className="sticky left-0 flex justify-end top-0 z-10 animate-in slide-in-from-right">
      <div className="bg-teal-900 rounded-bl shadow-md">
        <Button
          shape="none"
          variant="ghost"
          className="text-white px-4 py-2 flex gap-2"
          onClick={() => actions.clearFilters()}
        >
          <FunnelIcon className="h-4 w-4" /> <span>Clear filter</span>
        </Button>
      </div>
    </div>
  );
};

const CountryHistoryVirtualList = ({
  details,
  data,
}: {
  details: CountryDetails;
  data: CountryHistoryYear[];
}) => {
  const parentRef = useRef<HTMLDivElement>(null);

  // need to use a virtualizer here as we have so many tooltips
  const virtualizer = useVirtualizer({
    count: data.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (i) => data[i].events.length * 128 + 24,
    paddingStart: 24,
  });
  const items = virtualizer.getVirtualItems();

  return (
    <div
      ref={parentRef}
      className={
        "absolute left-4 right-0 top-0 bottom-0 self-center overflow-y-auto"
      }
    >
      <div
        className="relative w-full"
        style={{ height: virtualizer.getTotalSize(), contain: "strict" }}
      >
        <FilterOverlay />
        <div
          className="absolute top-0 left-0 w-full"
          style={{ transform: `translateY(${items[0]?.start ?? 0}px)` }}
        >
          {items.map((virtualRow) => (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              className="flex gap-8 py-4"
            >
              <div>{data[virtualRow.index].year}</div>
              <div className="flex flex-col grow gap-3">
                {data[virtualRow.index].events.map((evt, i) => (
                  <CountryHistoryCard country={details} key={i} evt={evt} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const CountryHistoryList = memo(function CountryHistoryList({
  details,
  data,
}: {
  details: CountryDetails;
  data: CountryHistoryYear[];
}) {
  const result = useFilteredHistory(data);
  return <CountryHistoryVirtualList details={details} data={result} />;
});

export const CountryHistory = ({ details }: { details: CountryDetails }) => {
  const { data, error } = useEu4Worker(
    useCallback(
      async (worker) => worker.eu4GetCountryHistory(details.tag),
      [details.tag],
    ),
  );

  if (error) {
    return <Alert.Error msg={error} />;
  }

  if (data === undefined) {
    return null;
  }

  return <CountryHistoryList details={details} data={data.data} />;
};

type HistoryFilter = ReturnType<typeof eventToFilter>;

type HistoryFilterState = {
  filters: HistoryFilter[];
  actions: {
    addFilter: (arg: HistoryFilter) => void;
    clearFilters: () => void;
  };
};

const useFilterStore = create<HistoryFilterState>()((set, get) => ({
  filters: [],
  actions: {
    addFilter: (arg) => set({ filters: [...get().filters, arg] }),
    clearFilters: () => set({ filters: [] }),
  },
}));

const useFilterActions = () => useFilterStore((x) => x.actions);
const useShowFilter = () => useFilterStore((x) => x.filters.length) > 0;
const useFilteredHistory = (data: CountryHistoryYear[]) => {
  const rawFilters = useFilterStore((x) => x.filters);
  const filters = useMemo(() => new Set(rawFilters), [rawFilters]);
  return useMemo(
    () =>
      data.map((year) => ({
        ...year,
        events: year.events.filter(
          (event) => !filters.has(eventToFilter(event)),
        ),
      })),
    [data, filters],
  );
};
