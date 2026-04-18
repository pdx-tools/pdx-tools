import { useState } from "react";
import { cx } from "class-variance-authority";
import { CameraIcon } from "@heroicons/react/24/outline";
import { FireIcon } from "@heroicons/react/24/solid";
import { LoadingIcon } from "@/components/icons/LoadingIcon";
import { useTriggeredAction } from "@/hooks/useTriggeredAction";
import { downloadData } from "@/lib/downloadData";
import { toast } from "@/lib/toast";
import { getErrorMessage } from "@/lib/getErrorMessage";
import {
  useEu5Engine,
  useEu5MapMode,
  useEu5IsGeneratingScreenshot,
  useSaveFilename,
  useEu5SaveDate,
  useEu5PlaythroughName,
} from "../store";

type ActionDef = {
  id: string;
  label: string;
  hint: string;
};

const ACTION_DEFS: ActionDef[] = [
  { id: "screenshot", label: "Capture screenshot", hint: "shift · full res" },
  { id: "melt", label: "Melt save file", hint: "binary → plaintext" },
];

export function ActionsRail() {
  const [hoveredAction, setHoveredAction] = useState<ActionDef | null>(null);

  return (
    <div className="shrink-0">
      <div className="flex h-8 items-center px-3.5">
        {hoveredAction ? (
          <div className="flex w-full items-baseline justify-between gap-2">
            <span className="text-[12px] text-eu5-ink-300">{hoveredAction.label}</span>
            <span className="font-mono text-[10px] text-eu5-ink-500">{hoveredAction.hint}</span>
          </div>
        ) : (
          <span className="font-mono text-[10px] text-eu5-ink-500 italic">Hover an action</span>
        )}
      </div>

      <div className="flex h-12 items-center justify-center gap-2 border-t border-eu5-line">
        <ScreenshotButton def={ACTION_DEFS[0]} onHover={setHoveredAction} />
        <MeltButton def={ACTION_DEFS[1]} onHover={setHoveredAction} />
      </div>
    </div>
  );
}

type ActionButtonProps = {
  def: ActionDef;
  onHover: (def: ActionDef | null) => void;
  children: React.ReactNode;
  isLoading?: boolean;
  onClick?: (e: React.MouseEvent) => void;
};

function ActionButton({ def, onHover, children, isLoading, onClick }: ActionButtonProps) {
  return (
    <button
      type="button"
      disabled={isLoading}
      onClick={onClick}
      onMouseEnter={() => onHover(def)}
      onMouseLeave={() => onHover(null)}
      className={cx(
        "grid h-10 w-10 place-items-center rounded transition-colors duration-100",
        "text-eu5-ink-500 hover:bg-eu5-bg-hover hover:text-eu5-ink-100",
        isLoading && "cursor-not-allowed opacity-40",
      )}
    >
      {isLoading ? <LoadingIcon className="h-4 w-4" /> : children}
    </button>
  );
}

function ScreenshotButton({
  def,
  onHover,
}: {
  def: ActionDef;
  onHover: (d: ActionDef | null) => void;
}) {
  const engine = useEu5Engine();
  const mapMode = useEu5MapMode();
  const isGeneratingScreenshot = useEu5IsGeneratingScreenshot();
  const saveDate = useEu5SaveDate();
  const playthroughName = useEu5PlaythroughName();

  const { isLoading, run } = useTriggeredAction({
    action: async (fullResolution: boolean) => {
      try {
        const blob = await engine.trigger.generateScreenshot(fullResolution);
        const dateStr = `${saveDate.year}-${String(saveDate.month).padStart(2, "0")}-${String(saveDate.day).padStart(2, "0")}`;
        downloadData(blob, `${playthroughName}-${dateStr}-${mapMode}.png`);
        toast.success("Screenshot downloaded", { duration: 2000 });
      } catch (error) {
        toast.error("Screenshot error", { description: getErrorMessage(error), duration: 3000 });
        throw error;
      }
    },
  });

  return (
    <ActionButton
      def={def}
      onHover={onHover}
      isLoading={isLoading || isGeneratingScreenshot}
      onClick={(e) => run(e.shiftKey)}
    >
      <CameraIcon className="h-4 w-4" />
    </ActionButton>
  );
}

function MeltButton({ def, onHover }: { def: ActionDef; onHover: (d: ActionDef | null) => void }) {
  const engine = useEu5Engine();
  const saveFilename = useSaveFilename();

  const { isLoading, run } = useTriggeredAction({
    action: async () => {
      try {
        const meltedData = await engine.trigger.melt();
        const baseName = saveFilename.substring(0, saveFilename.lastIndexOf(".")) || saveFilename;
        downloadData(meltedData, `${baseName}_melted.eu5`);
        toast.success("Save file melted and downloaded", { duration: 2000 });
      } catch (error) {
        toast.error("Melt error", { description: getErrorMessage(error), duration: 3000 });
        throw error;
      }
    },
  });

  return (
    <ActionButton def={def} onHover={onHover} isLoading={isLoading} onClick={() => run()}>
      <FireIcon className="h-4 w-4" />
    </ActionButton>
  );
}
