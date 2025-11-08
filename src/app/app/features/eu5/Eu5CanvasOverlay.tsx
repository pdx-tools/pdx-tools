import { useId } from "react";
import type { ComponentType, SVGProps } from "react";
import {
  useEu5Engine,
  useEu5MapMode,
  useEu5OwnerBorders,
  useEu5IsGeneratingScreenshot,
  useSaveFilename,
  useEu5SaveDate,
  useEu5PlaythroughName,
} from "./store";
import { Eu5MapLegend } from "./Eu5MapLegend";
import { CameraIcon } from "@heroicons/react/24/solid";
import {
  ArrowUpTrayIcon,
  BookOpenIcon,
  FlagIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
import { LoadingIcon } from "@/components/icons/LoadingIcon";
import { downloadData } from "@/lib/downloadData";
import { toast } from "sonner";
import { useTriggeredAction } from "@/hooks/useTriggeredAction";
import { getErrorMessage } from "@/lib/getErrorMessage";
import { Switch } from "@/components/Switch";
import { cx } from "class-variance-authority";
import { ToggleGroup } from "@/components/ToggleGroup";
import { ChartAreaIcon } from "@/components/icons/ChartAreaIcon";
import { Tooltip } from "@/components/Tooltip";
import { AppSvg } from "@/components/icons/AppIcon";
import { Link } from "react-router";
import { useEngineActions } from "../engine";

const MAP_MODE_CONFIG = [
  {
    value: "political",
    label: "Political",
  },
  {
    value: "control",
    label: "Control",
  },
  {
    value: "development",
    label: "Development",
  },
  {
    value: "population",
    label: "Population",
  },
  {
    value: "markets",
    label: "Markets",
  },
  {
    value: "rgoLevel",
    label: "RGO Level",
  },
  {
    value: "buildingLevels",
    label: "Building Levels",
  },
  {
    value: "possibleTax",
    label: "Possible Tax",
  },
  {
    value: "religion",
    label: "Religion",
  },
] as const;

type MapModeOption = (typeof MAP_MODE_CONFIG)[number]["value"];

type ComingSoonFeature = {
  tooltip: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
};

const COMING_SOON_FEATURES: ComingSoonFeature[] = [
  {
    tooltip: "Uploads",
    icon: ArrowUpTrayIcon,
  },
  {
    tooltip: "Charts",
    icon: ChartAreaIcon,
  },
  {
    tooltip: "Guides",
    icon: BookOpenIcon,
  },
  {
    tooltip: "Country insights",
    icon: FlagIcon,
  },
];

export const Eu5CanvasOverlay = () => {
  const engine = useEu5Engine();
  const currentMapMode = useEu5MapMode();
  const ownerBordersEnabled = useEu5OwnerBorders();
  const bordersSwitchId = useId();
  const mapModesHeadingId = useId();
  const { resetSaveAnalysis } = useEngineActions();

  const handleMapModeClick = async (mode: MapModeOption) => {
    await engine.trigger.selectMapMode(mode);
  };

  const handleBordersToggle = async () => {
    await engine.trigger.toggleOwnerBorders();
  };

  return (
    <div className="relative flex h-full w-full flex-col gap-4 rounded-3xl border border-white/10 bg-slate-950/75 p-5 text-slate-100 shadow-xl backdrop-blur">
      <div className="pointer-events-none absolute bottom-0 -left-[120px]">
        <Eu5MapLegend />
      </div>

      <Link
        to="/"
        onClick={() => {
          resetSaveAnalysis();
        }}
        className="absolute top-5 right-5 inline-flex items-center justify-center focus-visible:ring-2 focus-visible:ring-sky-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 focus-visible:outline-none"
      >
        <span className="sr-only">Return to home</span>
        <AppSvg
          width={30}
          height={30}
          className="transition-transform duration-150 hover:scale-110"
        />
      </Link>

      <EarlyAccessRoadmap />

      <div className="flex flex-1 flex-col gap-4 overflow-hidden">
        <div className="flex-1 overflow-y-auto pr-1">
          <div className="mb-3 flex flex-col gap-1 pr-1">
            <p
              id={mapModesHeadingId}
              className="text-[11px] font-semibold tracking-[0.25em] text-slate-300 uppercase"
            >
              Map Modes
            </p>
          </div>
          <ToggleGroup
            type="single"
            value={currentMapMode}
            onValueChange={(value) => {
              if (!value || value === currentMapMode) return;
              void handleMapModeClick(value as MapModeOption);
            }}
            aria-labelledby={mapModesHeadingId}
            orientation="horizontal"
            className="grid grid-cols-2 gap-2 pr-1"
          >
            {MAP_MODE_CONFIG.map((mode) => (
              <ToggleGroup.Item
                key={mode.value}
                value={mode.value}
                variant="card"
                className="h-16 flex-col items-center justify-center gap-1 text-center text-sm font-semibold"
              >
                <span>{mode.label}</span>
              </ToggleGroup.Item>
            ))}
          </ToggleGroup>
        </div>

        <div className="space-y-4 rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3">
          <label
            htmlFor={bordersSwitchId}
            className="flex items-center justify-between gap-3"
          >
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold tracking-wide text-slate-300 uppercase">
                Owner Borders
              </span>
              <span className="text-xs text-slate-300/80">
                Highlight borders between countries.
              </span>
            </div>
            <Switch
              id={bordersSwitchId}
              checked={ownerBordersEnabled}
              onCheckedChange={() => {
                void handleBordersToggle();
              }}
            />
          </label>
        </div>

        <Screenshot />
        <Melt />
      </div>
    </div>
  );
};

const EarlyAccessRoadmap = () => {
  return (
    <section className="mt-10 rounded-2xl border border-amber-400/40 bg-amber-500/10 p-4 text-[11px] leading-relaxed text-amber-100 shadow-inner shadow-amber-500/20">
      <header className="text-center text-[10px] font-semibold tracking-[0.3em] text-amber-200 uppercase">
        <span>🚧 Under construction 🚧</span>
      </header>
      <p className="mt-2 text-center text-balance text-amber-50/90">
        EU5 is being brought up to speed. The UI is very much in flux. Stay
        tuned!
      </p>
      <div className="mt-4 grid grid-cols-4 place-items-center gap-2">
        {COMING_SOON_FEATURES.map((feature) => (
          <ComingSoonFeatureTile key={feature.tooltip} feature={feature} />
        ))}
      </div>
    </section>
  );
};

const ComingSoonFeatureTile = ({ feature }: { feature: ComingSoonFeature }) => {
  const Icon = feature.icon;

  return (
    <Tooltip delayDuration={100}>
      <Tooltip.Trigger asChild>
        <button
          type="button"
          aria-disabled="true"
          onClick={(event) => {
            event.preventDefault();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
            }
          }}
          className={cx(
            "group relative flex h-12 w-12 items-center justify-center rounded-full border border-amber-400/40 bg-amber-500/10 text-amber-100 transition hover:border-amber-300/70 hover:bg-amber-500/15 focus-visible:ring-2 focus-visible:ring-sky-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 focus-visible:outline-none",
          )}
        >
          <Icon
            className={cx(
              "h-5 w-5 text-amber-100 transition-transform duration-300 group-hover:scale-110",
            )}
            aria-hidden="true"
          />
        </button>
      </Tooltip.Trigger>
      <Tooltip.Content side="top" className="text-xs font-semibold">
        {feature.tooltip}
      </Tooltip.Content>
    </Tooltip>
  );
};

function Screenshot() {
  const engine = useEu5Engine();
  const mapMode = useEu5MapMode();
  const isGeneratingScreenshot = useEu5IsGeneratingScreenshot();
  const saveDate = useEu5SaveDate();
  const playthroughName = useEu5PlaythroughName();

  const { isLoading, run } = useTriggeredAction({
    action: async (fullResolution: boolean) => {
      try {
        const blob = await engine.trigger.generateScreenshot(fullResolution);
        const filename = `${playthroughName}-${saveDate}-${mapMode}.png`;
        downloadData(blob, filename);
        toast.success(`Screenshot downloaded`, {
          duration: 2000,
        });
      } catch (error) {
        toast.error("Screenshot error", {
          description: getErrorMessage(error),
          duration: 3000,
        });
        throw error;
      }
    },
  });

  const isDisabled = isGeneratingScreenshot || isLoading;

  return (
    <button
      type="button"
      disabled={isDisabled}
      onClick={(event) => {
        run(event.shiftKey);
      }}
      className={cx(
        "flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition focus-visible:ring-2 focus-visible:ring-sky-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 focus-visible:outline-none",
        "border-white/5 bg-white/[0.03] hover:border-sky-400/40 hover:bg-white/10",
        isDisabled && "cursor-not-allowed opacity-60 hover:border-white/5",
      )}
    >
      <div className="flex items-center gap-3">
        {isDisabled ? (
          <LoadingIcon className="h-5 w-5 text-sky-300" />
        ) : (
          <CameraIcon className="h-5 w-5 text-sky-300" />
        )}
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold text-slate-100">
            Capture screenshot
          </span>
          <span className="text-xs text-slate-300/80">
            Shift-click for full resolution.
          </span>
        </div>
      </div>
      <span className="text-[11px] font-semibold tracking-[0.2em] text-slate-400 uppercase">
        PNG
      </span>
    </button>
  );
}

function Melt() {
  const engine = useEu5Engine();
  const saveFilename = useSaveFilename();

  const { isLoading, run } = useTriggeredAction({
    action: async () => {
      try {
        const meltedData = await engine.trigger.melt();
        const baseName =
          saveFilename.substring(0, saveFilename.lastIndexOf(".")) ||
          saveFilename;
        const filename = `${baseName}_melted.eu5`;
        downloadData(meltedData, filename);
        toast.success(`Save file melted and downloaded`, {
          duration: 2000,
        });
      } catch (error) {
        toast.error("Melt error", {
          description: getErrorMessage(error),
          duration: 3000,
        });
        throw error;
      }
    },
  });

  return (
    <button
      type="button"
      disabled={isLoading}
      onClick={() => {
        run();
      }}
      className={cx(
        "flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition focus-visible:ring-2 focus-visible:ring-sky-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 focus-visible:outline-none",
        "border-white/5 bg-white/[0.03] hover:border-sky-400/40 hover:bg-white/10",
        isLoading && "cursor-not-allowed opacity-60 hover:border-white/5",
      )}
    >
      <div className="flex items-center gap-3">
        {isLoading ? (
          <LoadingIcon className="h-5 w-5 text-emerald-300" />
        ) : (
          <SparklesIcon className="h-5 w-5 text-emerald-300" />
        )}
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold text-slate-100">
            Melt save file
          </span>
          <span className="text-xs text-slate-300/80">
            Convert the save to plaintext
          </span>
        </div>
      </div>
      <span className="text-[11px] font-semibold tracking-[0.2em] text-slate-400 uppercase">
        TXT
      </span>
    </button>
  );
}
