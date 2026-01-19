import { useState, useEffect } from "react";
import { Dialog } from "@/components/Dialog";
import { useEu5Engine } from "../../store";
import { StateEfficacy } from "./StateEfficacy";
import { Alert } from "@/components/Alert";
import { LoadingIcon } from "@/components/icons/LoadingIcon";
import { cx } from "class-variance-authority";
import type { StateEfficacyData } from "@/wasm/wasm_eu5";

type ChartId = "state-efficacy";

interface ChartData {
  stateEfficacy: StateEfficacyData | null;
}

interface ChartsDialogProps {
  children: React.ReactNode;
}

export const ChartsDialog = ({ children }: ChartsDialogProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeChart, setActiveChart] = useState<ChartId>("state-efficacy");
  const [data, setData] = useState<ChartData>({ stateEfficacy: null });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const engine = useEu5Engine();

  useEffect(() => {
    if (isOpen && !data.stateEfficacy && !isLoading) {
      const fetchData = async () => {
        setIsLoading(true);
        setError(null);
        try {
          const efficacyData = await engine.trigger.getStateEfficacy();
          setData((prev) => ({ ...prev, stateEfficacy: efficacyData }));
        } catch (err) {
          setError(
            err instanceof Error ? err.message : "Failed to load chart data",
          );
        } finally {
          setIsLoading(false);
        }
      };
      void fetchData();
    }
  }, [isOpen, data.stateEfficacy, isLoading, engine]);

  const charts = [
    {
      id: "state-efficacy" as const,
      name: "State Efficacy",
      description: "Control × Development",
    },
    // Future charts can be added here
  ];

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <Dialog.Trigger asChild>{children}</Dialog.Trigger>
      <Dialog.Content className="top-8 left-8 flex h-[calc(100vh-4rem)] w-[calc(100vw-4rem)] max-w-none translate-x-0 translate-y-0 flex-col overflow-hidden rounded-2xl border-white/10 bg-slate-950/95 p-0 shadow-2xl">
        {/* Header with Chart Tabs */}
        <div className="flex-shrink-0 border-b border-white/10 px-8 py-3">
          <div className="flex items-center justify-between gap-8">
            <div className="flex-1">
              <Dialog.Title className="text-xl font-bold text-slate-100">
                Charts & Analytics
              </Dialog.Title>
            </div>

            {/* Chart Navigation Tabs */}
            {charts.length > 1 && (
              <div className="flex gap-2">
                {charts.map((chart) => (
                  <button
                    key={chart.id}
                    type="button"
                    onClick={() => setActiveChart(chart.id)}
                    className={cx(
                      "rounded-lg px-3 py-1.5 text-sm font-semibold transition focus-visible:ring-2 focus-visible:ring-sky-400/60 focus-visible:outline-none",
                      activeChart === chart.id
                        ? "border border-sky-400/40 bg-sky-500/20 text-sky-300"
                        : "border border-white/10 bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-300",
                    )}
                  >
                    {chart.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-8 py-4">
          {isLoading ? (
            <div className="flex h-full items-center justify-center">
              <div className="flex flex-col items-center gap-4">
                <LoadingIcon className="h-12 w-12 text-sky-400" />
                <p className="text-slate-300">Loading chart data...</p>
              </div>
            </div>
          ) : error ? (
            <Alert.Error msg={error} />
          ) : (
            <>
              {activeChart === "state-efficacy" && data.stateEfficacy && (
                <StateEfficacy data={data.stateEfficacy} />
              )}
            </>
          )}
        </div>

        {/* Footer with active chart info */}
        <div className="flex-shrink-0 border-t border-white/10 px-8 py-2">
          {activeChart === "state-efficacy" && (
            <div className="text-xs text-slate-400">
              <span className="font-semibold text-slate-300">Formula:</span>{" "}
              Location Efficacy = Control × Development | Total Efficacy = Σ(all
              owned locations) | Filtered to nations with ≥10 locations
            </div>
          )}
        </div>
      </Dialog.Content>
    </Dialog>
  );
};
