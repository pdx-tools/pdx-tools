import { AnimatedValue } from "./components/AnimatedValue";
import { ContextGraphs } from "./history/ContextGraphs";
import { campaignKey } from "./history/types";
import { useSnapshotSwitch } from "./history/useSnapshotSwitch";
import { useEu5SaveInput } from "./store";
import { SaveHistory } from "./history/SaveHistory";
import { useHistory } from "./history/store";
import { GameButton } from "@/components/game/Button";
import type React from "react";
import { useCallback, useState } from "react";
import { ResizablePanel } from "./components/ResizablePanel";
import type { ActiveProfileIdentity, EntityHeader } from "@/wasm/wasm_eu5";
import { formatCompact, formatInt } from "@/lib/format";
import { Eu5Flag } from "./components/flags/Eu5Flag";
import {
  useEu5MapMode,
  useEu5SelectionState,
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
  const switchSnapshot = useSnapshotSwitch();
  const saveInput = useEu5SaveInput();
  const historyOpen = useHistory((s) => s.panelOpen);
  const showHistory = useHistory((s) => s.showPanel);
  const mapMode = useEu5MapMode();
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
              <span className="font-game-ui text-sm font-semibold text-game-ink-300">
                Campaign history
              </span>
            ) : (
              <InsightPanelTitle />
            )}
          </div>
          <ResizablePanel.MaximizeButton className={btnCx} />
        </ResizablePanel.Header>
        <div className="flex gap-1 border-b border-game-line px-3 py-2">
          <GameButton
            variant={historyOpen ? "ghost" : "default"}
            onClick={() => showHistory(false)}
          >
            Current date
          </GameButton>
          <GameButton variant={historyOpen ? "default" : "ghost"} onClick={() => showHistory(true)}>
            Over time
          </GameButton>
        </div>
        <ResizablePanel.Content>
          {open && !historyOpen ? (
            <>
              <PanelContentInner />
              <InlineHistory />
            </>
          ) : null}
          <div hidden={!open || !historyOpen}>
            <PanelSaveHistory
              visible={open && historyOpen}
              mapMode={mapMode}
              currentFile={saveInput.kind === "file" ? saveInput.file : undefined}
              onChoose={switchSnapshot}
            />
          </div>
        </ResizablePanel.Content>
      </ResizablePanel.Root>
    </PanelNavProvider>
  );
}

function useHistoryContext(
  mapMode: React.ComponentProps<typeof SaveHistory>["mapMode"],
  enabled = true,
) {
  const nav = usePanelNav();
  const selection = useEu5SelectionState();
  const identity = nav.top?.profile ?? selection?.activeProfile;
  const kind = identity?.kind;
  const key =
    identity?.kind === "country"
      ? identity.country.key
      : identity?.kind === "market"
        ? identity.market.key
        : null;
  const { data: focus } = useEu5Trigger(
    async (engine) => {
      if (!enabled || key == null) return null;
      if (kind === "country") {
        const profile = await engine.trigger.getCountryProfile(key);
        return profile ? { tag: profile.header.tag ?? undefined, name: profile.header.name } : null;
      }
      if (kind === "market") {
        const profile = await engine.trigger.getMarketProfile(key);
        return profile ? { center: profile.centerId, name: profile.header.name } : null;
      }
      return null;
    },
    [kind, key, enabled],
  );
  const tab = nav.profileTabs.country;
  const mode =
    kind === "country" && tab === "religion"
      ? "religion"
      : kind === "country" && tab === "population"
        ? "population"
        : kind === "country" && tab === "diplomacy"
          ? "political"
          : kind === "market"
            ? "markets"
            : mapMode;
  return { mode, focus };
}

function PanelSaveHistory(props: React.ComponentProps<typeof SaveHistory>) {
  const { mode, focus } = useHistoryContext(props.mapMode, props.visible);
  return (
    <SaveHistory
      {...props}
      mapMode={mode}
      focusTag={focus && "tag" in focus ? focus.tag : undefined}
      focusName={focus?.name}
      focusMarketCenter={focus && "center" in focus ? focus.center : undefined}
    />
  );
}

function InlineHistory() {
  const [expanded, setExpanded] = useState(false);
  const mode = useEu5MapMode();
  const { mode: contextMode, focus } = useHistoryContext(mode, expanded);
  const snapshots = useHistory((s) => s.snapshots);
  const selectedHash = useHistory((s) => s.selectedHash);
  const selected = snapshots.find((s) => s.hash === selectedHash);
  const showPanel = useHistory((s) => s.showPanel);
  if (!selected || contextMode === "markets") return null;
  const dates = snapshots.filter((s) => campaignKey(s) === campaignKey(selected));
  return (
    <details
      className="mx-4 my-3 rounded-(--radius-panel) border border-game-line-strong bg-game-panel p-3"
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary className="cursor-pointer font-game-ui text-xs text-game-ink-300">
        {focus?.name ?? MAP_MODE_TITLES[mode]} · evolution over {dates.length} saved dates
      </summary>
      {expanded && (
        <div className="mt-3">
          <ContextGraphs
            dates={dates}
            mode={contextMode ?? mode}
            country={focus && "tag" in focus ? focus.tag : "world"}
            countryName={focus?.name}
            selectedHash={selectedHash}
          />
          <GameButton variant="ghost" onClick={() => showPanel(true)}>
            Open history controls
          </GameButton>
        </div>
      )}
    </details>
  );
}

function PanelContentInner() {
  const nav = usePanelNav();
  const { top, stack } = nav;
  const selectionState = useEu5SelectionState();
  const currentMapMode = useEu5MapMode();
  const activeProfile = selectionState?.activeProfile;

  let content: React.ReactNode;

  if (top?.kind === "focus") {
    content = <EntityProfileRoot identity={top.profile} />;
  } else if (top?.kind === "profile") {
    content = <EntityProfileRoot identity={top.profile} />;
  } else if (activeProfile != null) {
    content = <EntityProfileRoot key={activeProfile.kind} identity={activeProfile} />;
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

  if (stack.length > 0) {
    return (
      <div className="flex h-full flex-col">
        <Breadcrumb />
        <div className="min-h-0 flex-1 overflow-y-auto">{content}</div>
      </div>
    );
  }

  return <>{content}</>;
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
    <span className="truncate font-game-num text-[10.5px] text-game-ink-500 tabular-nums">
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
        return engine.trigger.getCountryProfile(id).then((profile) => profile?.header);
      }
      return engine.trigger.getMarketProfile(id).then((profile) => profile?.header);
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
          className="h-3.5 w-3.5 shrink-0 rounded-[1px] border border-black/25"
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
        className="shrink-0 rounded-[2px] border border-black/30"
      />
      <span className="flex min-w-0 flex-col gap-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 rounded-[1px] border border-game-line-strong px-1 font-game-num text-[10px] tracking-[0.06em] text-game-ink-500">
            {header.tag}
          </span>
          <span className="truncate font-game-ui text-base font-semibold text-game-ink-100">
            {header.name}
          </span>
        </span>
        <span className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <HeadlineStat label="Locations" value={formatInt(header.headline.locationCount)} />
          <HeadlineStat label="Development" value={formatInt(header.headline.totalDevelopment)} />
          <HeadlineStat
            label="Population"
            value={formatCompact(header.headline.totalPopulation, 1)}
          />
        </span>
      </span>
    </span>
  );
}

function HeadlineStat({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-baseline gap-1">
      <span className="font-game-num text-[13px] font-medium text-game-ink-100 tabular-nums">
        <AnimatedValue value={value} />
      </span>
      <span className="text-[10px] tracking-[0.06em] text-game-ink-500 uppercase">{label}</span>
    </span>
  );
}
