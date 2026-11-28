import { GameButton } from "@/components/game/Button";
import { useIsCampaignAnalysisEnabled } from "@/features/campaign/analysis/useIsCampaignAnalysisEnabled";
import { ContextGraphs } from "./history/ContextGraphs";
import { SaveHistory } from "./history/SaveHistory";
import { useCurrentHistorySnapshot } from "./history/currentSnapshot";
import { useModeHistory } from "./history/useHistorySeries";
import { useHistory } from "./history/store";
import { useMapHistory } from "./history/context";
import type React from "react";
import { useCallback, useState } from "react";
import { ResizablePanel } from "./components/ResizablePanel";
import type { ActiveProfileIdentity, EntityHeader } from "@/wasm/wasm_eu5";
import { formatInt } from "@/lib/format";
import { Figure } from "./components/Figure";
import { Eu5Flag } from "./components/flags/Eu5Flag";
import { formatLongDate } from "@/features/timeline/date";
import {
  useEu5MapMode,
  useEu5PlaythroughId,
  useEu5SaveDate,
  useEu5SelectionState,
  useEu5TimelineLive,
  useEu5World,
  useSetEu5InsightPanelWidth,
} from "./store";
import { StateEfficacyInsight } from "./features/insights/StateEfficacy";
import { ControlInsight } from "./features/insights/Control";
import { DevelopmentInsight } from "./features/insights/DevelopmentInsight";
import { WealthInsight } from "./features/insights/Wealth";
import { UnrealizedTaxBaseInsight } from "./features/insights/UnrealizedTaxBase";
import { MarketsInsight } from "./features/insights/Markets";
import { PopulationInsight } from "./features/insights/Population";
import { PopulationGrowthInsight } from "./features/insights/PopulationGrowth";
import { BuildingLevelsInsight } from "./features/insights/BuildingLevels";
import { ReligionInsight } from "./features/insights/ReligionInsight";
import { RgoInsight } from "./features/insights/Rgo";
import { PoliticalInsight } from "./features/insights/Political";
import { EntityProfileRoot } from "./features/profiles";
import { PanelNavProvider, usePanelNav } from "./features/profiles/PanelNavContext";
import { Breadcrumb } from "./features/profiles/Breadcrumb";
import { useEu5Trigger } from "./features/profiles/useEu5Trigger";

type Eu5InsightPanelProps = {
  open: boolean;
  onClose: () => void;
};

export function Eu5InsightPanel({ open, onClose }: Eu5InsightPanelProps) {
  const preview = useMapHistory()?.preview;
  const campaignId = useEu5PlaythroughId();
  const allowed = useIsCampaignAnalysisEnabled() && !!campaignId;
  const historyOpen = useHistory((state) => allowed && state.panelOpen);
  const showHistory = useHistory((state) => state.showPanel);
  const setInsightPanelWidth = useSetEu5InsightPanelWidth();
  const handleWidthChange = useCallback(
    (width: number) => setInsightPanelWidth(width),
    [setInsightPanelWidth],
  );

  // The ring comes from ResizablePanel's own controls; this only styles the plate.
  const btnCx =
    "border border-game-line bg-game-panel-2 text-game-ink-500 hover:bg-game-panel-hover hover:text-game-ink-100";

  return (
    <PanelNavProvider>
      <ResizablePanel.Root
        open={open}
        onClose={onClose}
        side="right"
        defaultWidth={640}
        collapseThreshold={256}
        maxWidth={1920}
        onWidthChange={handleWidthChange}
        className="border-l border-game-line-strong bg-game-panel"
      >
        <ResizablePanel.Header className="border-b border-game-line">
          <ResizablePanel.CloseButton className={btnCx} />
          <div className="min-w-0 flex-1">
            {historyOpen ? (
              "Campaign history"
            ) : preview ? (
              "Campaign overview"
            ) : (
              <InsightPanelTitle />
            )}
          </div>
          <ResizablePanel.MaximizeButton className={btnCx} />
        </ResizablePanel.Header>
        {/* Don't render panel content until open as panels can be very expensive to render with large charts */}
        <ResizablePanel.Content scroll={false} className="flex min-h-0 flex-col">
          {open && (
            <>
              {allowed && (
                <div
                  className="flex shrink-0 gap-2 border-b border-game-line p-2"
                  aria-label="Insight view"
                >
                  <GameButton
                    variant={historyOpen ? "ghost" : "default"}
                    aria-pressed={!historyOpen}
                    onClick={() => showHistory(false)}
                  >
                    Current save
                  </GameButton>
                  <GameButton
                    variant={historyOpen ? "default" : "ghost"}
                    aria-pressed={historyOpen}
                    onClick={() => showHistory(true)}
                  >
                    Over time
                  </GameButton>
                </div>
              )}
              {historyOpen ? (
                <FocusedHistory key={campaignId} />
              ) : (
                <>
                  <div className="min-h-0 flex-1 overflow-y-auto">
                    <PanelContentInner key={preview ? "preview" : "live"} />
                  </div>
                  {allowed && <InlineHistory />}
                </>
              )}
            </>
          )}
        </ResizablePanel.Content>
      </ResizablePanel.Root>
    </PanelNavProvider>
  );
}

function useHistoryFocus(requested: boolean) {
  const mapMode = useEu5MapMode();
  const selection = useEu5SelectionState();
  const nav = usePanelNav();
  const preview = useMapHistory()?.preview;
  const active = preview ? null : (nav.top?.profile ?? selection?.activeProfile);
  const kind = active?.kind;
  const country = active?.kind === "country" ? active.country : undefined;
  const market = active?.kind === "market" ? active.market : undefined;
  const key = country?.key ?? market?.key;
  const { data, error, loading } = useEu5Trigger(
    async ({ queries }) => {
      if (!requested || key === undefined) return null;
      if (kind === "country") {
        const identity = await queries.getCountryIdentity(key);
        return { kind, key, id: identity?.id };
      }
      if (kind === "market") {
        const profile = await queries.getMarketProfile(key);
        return { kind, key, id: profile?.centerId };
      }
      return null;
    },
    [key, kind, requested],
  );
  const focus = !loading && data && data.kind === kind && data.key === key ? data : null;
  const id = focus?.id;
  const tab = nav.profileTabs.country;
  const mode =
    kind === "market"
      ? "markets"
      : kind === "country" && tab === "religion"
        ? "religion"
        : kind === "country" && tab === "population"
          ? "population"
          : kind === "country" && tab === "diplomacy"
            ? "political"
            : mapMode;
  return {
    mode,
    countryId: kind === "country" ? id : undefined,
    marketCenter: kind === "market" ? id : undefined,
    name: id !== undefined ? (country?.name ?? market?.name) : undefined,
    summaryName: country?.name ?? market?.name,
    pending: requested && key !== undefined && !focus && !error,
  };
}

function FocusedHistory() {
  const focus = useHistoryFocus(true);
  return (
    <SaveHistory
      mode={focus.mode}
      modeTitle={MAP_MODE_TITLES[focus.mode]}
      focusCountryId={focus.countryId}
      focusMarketCenter={focus.marketCenter}
      focusName={focus.name}
      focusPending={focus.pending}
    />
  );
}

function InlineHistory() {
  const [expanded, setExpanded] = useState(false);
  const focus = useHistoryFocus(expanded);
  const current = useCurrentHistorySnapshot();
  const showPanel = useHistory((state) => state.showPanel);
  const { dates, data, error, loading } = useModeHistory(
    current?.campaignId ?? null,
    focus.mode,
    focus.countryId,
    expanded && !focus.pending && focus.mode !== "markets",
  );
  if (!current || focus.mode === "markets") return null;
  return (
    <div className="max-h-[45%] shrink-0 overflow-y-auto border-t border-game-line">
      <details
        open={expanded}
        className="mx-4 my-3 rounded-panel border border-game-line p-3"
        onToggle={(event) => setExpanded(event.currentTarget.open)}
      >
        <summary className="cursor-pointer text-xs text-game-ink-300">
          {focus.summaryName ?? MAP_MODE_TITLES[focus.mode]} over time
        </summary>
        {expanded && (
          <div className="mt-3 flex flex-col gap-2">
            {error ? (
              <p role="alert" className="text-xs">
                {error}
              </p>
            ) : loading || focus.pending ? (
              <p role="status" className="text-xs">
                Loading history…
              </p>
            ) : (
              <ContextGraphs
                dates={dates}
                data={data}
                mode={focus.mode}
                countryId={focus.countryId}
                countryName={focus.name}
                selectedId={current.id}
              />
            )}
            <GameButton variant="ghost" onClick={() => showPanel(true)}>
              Open history controls
            </GameButton>
          </div>
        )}
      </details>
    </div>
  );
}

function PanelContentInner() {
  const nav = usePanelNav();
  const { top, stack } = nav;
  const selectionState = useEu5SelectionState();
  const currentMapMode = useEu5MapMode();
  const timelineLive = useEu5TimelineLive();
  const saveDate = useEu5SaveDate();
  const preview = useMapHistory()?.preview;
  const activeProfile = preview ? null : selectionState?.activeProfile;

  if (preview)
    return (
      <p className="p-4 text-sm text-game-ink-500">
        Charts become available when playback pauses and this save has loaded.
      </p>
    );
  let content: React.ReactNode;

  if (!preview && top?.kind === "focus") {
    content = <EntityProfileRoot identity={top.profile} />;
  } else if (!preview && top?.kind === "profile") {
    content = <EntityProfileRoot identity={top.profile} />;
  } else if (activeProfile != null) {
    content = (
      <EntityProfileRoot key={profileIdentityKey(activeProfile)} identity={activeProfile} />
    );
  } else if (currentMapMode === "political") {
    content = <PoliticalInsight />;
  } else if (currentMapMode === "control") {
    content = <ControlInsight />;
  } else if (currentMapMode === "development") {
    content = <DevelopmentInsight />;
  } else if (currentMapMode === "stateEfficacy") {
    content = <StateEfficacyInsight />;
  } else if (currentMapMode === "wealth") {
    content = <WealthInsight />;
  } else if (currentMapMode === "unrealizedTaxBase") {
    content = <UnrealizedTaxBaseInsight />;
  } else if (currentMapMode === "markets") {
    content = <MarketsInsight />;
  } else if (currentMapMode === "population") {
    content = <PopulationInsight />;
  } else if (currentMapMode === "populationGrowth") {
    content = <PopulationGrowthInsight />;
  } else if (currentMapMode === "buildingLevels") {
    content = <BuildingLevelsInsight />;
  } else if (currentMapMode === "religion") {
    content = <ReligionInsight />;
  } else if (currentMapMode === "rgoLevel") {
    content = <RgoInsight />;
  }

  if (content == null) {
    content = <EmptyInsightState />;
  }

  const body =
    !preview && stack.length > 0 ? (
      <div className="flex h-full flex-col">
        <Breadcrumb />
        <div className="min-h-0 flex-1 overflow-y-auto">{content}</div>
      </div>
    ) : (
      content
    );

  // One wrapper on every date, so a step across the save date keeps the panel.
  // The status stays mounted, so it is announced when the note appears.
  return (
    <div className="flex h-full flex-col">
      <div role="status">
        {!timelineLive && (
          // Only borders have a history in the save.
          <p className="flex min-h-7 items-center border-b border-game-line px-4 font-game-ui text-[12px] leading-[1.4] text-game-ink-500">
            <span>
              Values are from the save date,{" "}
              <span className="font-game-num text-game-ink-300 tabular-nums">
                {formatLongDate(saveDate)}
              </span>
            </span>
          </p>
        )}
      </div>
      <div className="flex min-h-0 flex-1 flex-col">{body}</div>
    </div>
  );
}

function profileIdentityKey(profile: ActiveProfileIdentity) {
  if (profile.kind === "location") return `location:${profile.location.key}`;
  if (profile.kind === "country") return `country:${profile.country.key}`;
  return `market:${profile.market.key}`;
}

function EmptyInsightState() {
  return (
    <div className="flex h-full items-center justify-center p-4 text-sm text-game-ink-500">
      No insight available for this view.
    </div>
  );
}

export const MAP_MODE_TITLES = {
  political: "Great powers",
  control: "Control",
  development: "Development",
  stateEfficacy: "Effective Development",
  wealth: "Wealth",
  unrealizedTaxBase: "Tax Base Gap",
  markets: "Markets",
  population: "Population",
  buildingLevels: "Building Levels",
  religion: "Religion",
  rgoLevel: "RGO Level",
  populationGrowth: "Population Growth",
} as const;

function InsightPanelTitle() {
  const nav = usePanelNav();
  const selectionState = useEu5SelectionState();
  const currentMapMode = useEu5MapMode();
  const topProfile =
    nav.top?.kind === "profile" || nav.top?.kind === "focus" ? nav.top.profile : null;
  const identity = topProfile ?? selectionState?.activeProfile;

  if (identity) return <ProfilePanelTitle identity={identity} />;

  return (
    <span className="flex min-w-0 flex-col gap-1">
      <span className="truncate font-game-ui text-sm font-semibold text-game-ink-300">
        {MAP_MODE_TITLES[currentMapMode] ?? "Insights"}
      </span>
      <InsightScopeLine />
    </span>
  );
}

/**
 * What every insight in this panel is a view of: the whole map, or the
 * current selection. This is the panel's line, not the map mode's, so it
 * holds still as the mode changes. It says the same thing the selection pill
 * on the map does.
 */
function InsightScopeLine() {
  const selection = useEu5SelectionState();
  const world = useEu5World();

  const parts: string[] = [];
  if (selection == null || selection.isEmpty) {
    parts.push("World", countOf(world.locationCount, "location"));
    parts.push(countOf(world.countryCount, "country", "countries"));
  } else {
    const name =
      selection.preset === "players" ? "Players" : (selection.scopeDisplayName ?? "Selection");
    parts.push(name, countOf(selection.locationCount, "location"));
    if (selection.entityCount > 1) {
      parts.push(countOf(selection.entityCount, "country", "countries"));
    }
  }

  return (
    <span className="truncate font-game-num text-[12px] text-game-ink-500 tabular-nums">
      {parts.join(" \u00b7 ")}
    </span>
  );
}

function countOf(n: number, singular: string, plural = `${singular}s`) {
  return `${formatInt(n)} ${n === 1 ? singular : plural}`;
}

function ProfilePanelTitle({ identity }: { identity: ActiveProfileIdentity }) {
  if (identity.kind === "location") {
    return (
      <span className="truncate font-game-ui text-sm font-semibold text-game-ink-300">
        {identity.location.name}
      </span>
    );
  }

  const entity = identity.kind === "country" ? identity.country : identity.market;
  return <EntityPanelTitle kind={identity.kind} id={entity.key} fallbackLabel={entity.name} />;
}

function EntityPanelTitle({
  kind,
  id,
  fallbackLabel,
}: {
  kind: "country" | "market";
  id: number;
  fallbackLabel: string;
}) {
  const { data: header } = useEu5Trigger(
    (engine) => {
      if (kind === "country") {
        return engine.queries.getCountryProfile(id).then((profile) => profile?.header);
      }
      return engine.queries.getMarketProfile(id).then((profile) => profile?.header);
    },
    [id, kind],
  );

  if (!header) {
    return (
      <span className="truncate font-game-ui text-sm font-semibold text-game-ink-300">
        {fallbackLabel}
      </span>
    );
  }

  return <EntityTitleContent header={header} />;
}

function EntityTitleContent({ header }: { header: EntityHeader }) {
  // Countries get a rich header: the coat of arms at its native atlas size
  // (72px) alongside the tag, name, and headline stats. Non-country entities
  // (markets) have no flag, so they stay a compact color-swatch + name label.
  if (!header.tag) {
    return (
      <span className="inline-flex max-w-full min-w-0 items-center gap-2">
        <span
          className="h-3.5 w-3.5 shrink-0 rounded-[1px] border border-game-rim"
          style={{ backgroundColor: header.colorHex }}
        />
        <span className="truncate font-game-ui text-sm font-semibold text-game-ink-300">
          {header.name}
        </span>
      </span>
    );
  }

  return (
    <span className="flex min-w-0 items-center gap-3">
      <Eu5Flag
        flag={header.flag}
        colorHex={header.colorHex}
        size="xl"
        alt={`${header.name} flag`}
        className="shrink-0 rounded-[2px] border border-game-rim"
      />
      <span className="flex min-w-0 flex-col gap-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 rounded-[1px] border border-game-line-strong px-1 font-game-num text-[12px] tracking-[0.04em] text-game-ink-500">
            {header.tag}
          </span>
          <span className="truncate font-game-ui text-base font-semibold text-game-ink-100">
            {header.name}
          </span>
        </span>
        <span className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <HeadlineStat
            label="Locations"
            value={<Figure value={header.headline.locationCount} form="count" />}
          />
          <HeadlineStat
            label="Development"
            value={<Figure value={header.headline.totalDevelopment} />}
          />
          <HeadlineStat
            label="Population"
            value={<Figure value={header.headline.totalPopulation} form="count" />}
          />
        </span>
      </span>
    </span>
  );
}

function HeadlineStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <span className="flex items-baseline gap-1">
      <span className="font-game-num text-[13px] font-medium text-game-ink-100 tabular-nums">
        {value}
      </span>
      <span className="text-game-label text-game-ink-500 uppercase">{label}</span>
    </span>
  );
}
