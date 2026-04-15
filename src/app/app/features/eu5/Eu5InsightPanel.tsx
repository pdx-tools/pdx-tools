import { ResizablePanel } from "@/components/ResizablePanel";
import { CursorArrowRaysIcon } from "@heroicons/react/24/outline";

type Eu5InsightPanelProps = {
  open: boolean;
  onClose: () => void;
};

export function Eu5InsightPanel({ open, onClose }: Eu5InsightPanelProps) {
  return (
    <ResizablePanel
      open={open}
      onClose={onClose}
      side="right"
      defaultWidth={352}
      minWidth={256}
      maxWidth={640}
      header={<span className="text-sm font-semibold text-slate-300">Insights</span>}
    >
      <EmptyState />
    </ResizablePanel>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-5 text-center">
      <CursorArrowRaysIcon className="h-12 w-12 text-slate-600" aria-hidden="true" />
      <div className="flex flex-col gap-1">
        <p className="text-sm text-slate-500">Select an entity on the map</p>
        <p className="text-xs text-slate-600">
          Click a country, market, or location to see detailed insights
        </p>
      </div>
    </div>
  );
}
