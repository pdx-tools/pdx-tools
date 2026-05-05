import type React from "react";
import { useCallback } from "react";
import { ResizablePanel } from "./components/ResizablePanel";
import type { ActiveProfileIdentity, EntityHeader } from "@/wasm/wasm_eu5";
import { useEu5MapMode, useEu5SelectionState, useSetEu5InsightPanelWidth } from "./store";
import { StateEfficacyInsight } from "./features/insights/StateEfficacy";
import { ControlInsight } from "./features/insights/Control";
import { DevelopmentInsight } from "./features/insights/DevelopmentInsight";
import { PossibleTaxInsight } from "./features/insights/PossibleTax";
import { TaxGapInsight } from "./features/insights/TaxGap";
import { MarketsInsight } from "./features/insights/Markets";
import { PopulationInsight } from "./features/insights/Population";
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
  const setInsightPanelWidth = useSetEu5InsightPanelWidth();
  const handleWidthChange = useCallback(
    (width: number) => setInsightPanelWidth(width),
    [setInsightPanelWidth],
  );

  const btnCx =
    "border border-game-line bg-white/5 text-game-ink-500 hover:bg-game-panel-hover hover:text-game-ink-100 focus-visible:ring-game-accent-300/50";

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
        className="border-l border-game-line bg-game-panel shadow-xl backdrop-blur"
      >
        <ResizablePanel.Header className="border-b border-game-line">
          <ResizablePanel.CloseButton className={btnCx} />
          <div className="min-w-0 flex-1">
            <InsightPanelTitle />
          </div>
          <ResizablePanel.MaximizeButton className={btnCx} />
        </ResizablePanel.Header>
        {/* Don't render panel content until open as panels can be very expensive to render with large charts */}
        <ResizablePanel.Content>{open ? <PanelContentInner /> : null}</ResizablePanel.Content>
      </ResizablePanel.Root>
    </PanelNavProvider>
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
  } else if (currentMapMode === "possibleTax") {
    content = <PossibleTaxInsight />;
  } else if (currentMapMode === "taxGap") {
    content = <TaxGapInsight />;
  } else if (currentMapMode === "markets") {
    content = <MarketsInsight />;
  } else if (currentMapMode === "population") {
    content = <PopulationInsight />;
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

function profileIdentityKey(profile: ActiveProfileIdentity) {
  if (profile.kind === "location") return `location:${profile.location_idx}`;
  if (profile.kind === "country") return `country:${profile.country_idx}`;
  return `market:${profile.market_id}`;
}

function EmptyInsightState() {
  return (
    <div className="flex h-full items-center justify-center p-4 text-sm text-game-ink-500">
      No insight available for this view.
    </div>
  );
}

const MAP_MODE_TITLES = {
  political: "Great powers",
  control: "Control",
  development: "Development",
  stateEfficacy: "State Efficacy",
  possibleTax: "Possible Tax",
  taxGap: "Tax Gap",
  markets: "Markets",
  population: "Population",
  buildingLevels: "Building Levels",
  religion: "Religion",
  rgoLevel: "RGO Level",
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
    <span className="truncate font-game-ui text-sm font-semibold text-game-ink-300">
      {MAP_MODE_TITLES[currentMapMode] ?? "Insights"}
    </span>
  );
}

function ProfilePanelTitle({ identity }: { identity: ActiveProfileIdentity }) {
  if (identity.kind === "location") {
    return (
      <span className="truncate font-game-ui text-sm font-semibold text-game-ink-300">
        {identity.label}
      </span>
    );
  }

  const id = identity.kind === "country" ? identity.country_idx : identity.market_id;
  return <EntityPanelTitle kind={identity.kind} id={id} fallbackLabel={identity.label} />;
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
  return (
    <span className="inline-flex max-w-full min-w-0 items-center gap-2">
      <span
        className="h-3.5 w-3.5 shrink-0 rounded-[1px] border border-black/25"
        style={{ backgroundColor: header.colorHex }}
      />
      {header.tag && (
        <span className="shrink-0 rounded-[1px] border border-game-line-strong px-1 font-game-num text-[10px] tracking-[0.06em] text-game-ink-700">
          {header.tag}
        </span>
      )}
      <span className="truncate font-game-ui text-sm font-semibold text-game-ink-300">
        {header.name}
      </span>
    </span>
  );
}
