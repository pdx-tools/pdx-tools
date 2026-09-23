import { CameraIcon } from "@heroicons/react/24/outline";
import { FireIcon } from "@heroicons/react/24/solid";
import { LoadingIcon } from "@/components/icons/LoadingIcon";
import { Tooltip } from "@/components/Tooltip";
import { GameButton } from "@/components/game/Button";
import { useTriggeredAction } from "@/hooks/useTriggeredAction";
import { downloadData } from "@/lib/downloadData";
import { toast } from "@/lib/toast";
import { getErrorMessage } from "@/lib/getErrorMessage";
import {
  useEu5Engine,
  useEu5MapMode,
  useEu5IsGeneratingScreenshot,
  useSaveFilename,
  useEu5TimelineMapDate,
  useEu5PlaythroughName,
} from "../store";
import { footLabel, footRow } from "./footRow";

/**
 * The Export row at the foot of the control panel: the actions that write a
 * file to disk. Each is a labelled button; the detail a player may not know
 * (the shift modifier, what melting is) sits in a tooltip.
 */
export function ExportRow() {
  return (
    <div className={footRow}>
      <span className={footLabel}>Export</span>
      <ScreenshotButton />
      <MeltButton />
    </div>
  );
}

type ExportButtonProps = {
  label: string;
  hint: string;
  icon: React.ReactNode;
  isLoading: boolean;
  onClick: (e: React.MouseEvent) => void;
};

function ExportButton({ label, hint, icon, isLoading, onClick }: ExportButtonProps) {
  return (
    <Tooltip>
      <Tooltip.Trigger asChild>
        <GameButton variant="ghost" className="px-2" disabled={isLoading} onClick={onClick}>
          {isLoading ? <LoadingIcon className="h-4 w-4" /> : icon}
          {label}
        </GameButton>
      </Tooltip.Trigger>
      <Tooltip.Content side="top" className="text-xs">
        {hint}
      </Tooltip.Content>
    </Tooltip>
  );
}

function ScreenshotButton() {
  const engine = useEu5Engine();
  const mapMode = useEu5MapMode();
  const isGeneratingScreenshot = useEu5IsGeneratingScreenshot();
  // The screenshot is the map as it stands, which on a scrubbed timeline is
  // a past date; the file is named for what it shows, not for the save.
  const mapDate = useEu5TimelineMapDate();
  const playthroughName = useEu5PlaythroughName();

  const { isLoading, run } = useTriggeredAction({
    action: async (fullResolution: boolean) => {
      try {
        const blob = await engine.trigger.generateScreenshot(fullResolution);
        const dateStr = `${mapDate.year}-${String(mapDate.month).padStart(2, "0")}-${String(mapDate.day).padStart(2, "0")}`;
        downloadData(blob, `${playthroughName}-${dateStr}-${mapMode}.png`);
        toast.success("Screenshot downloaded", { duration: 2000 });
      } catch (error) {
        toast.error("Screenshot error", { description: getErrorMessage(error), duration: 3000 });
        throw error;
      }
    },
  });

  return (
    <ExportButton
      label="Screenshot"
      hint="Save the map as a PNG. Shift-click for full resolution."
      icon={<CameraIcon className="h-4 w-4" />}
      isLoading={isLoading || isGeneratingScreenshot}
      onClick={(e) => run(e.shiftKey)}
    />
  );
}

function MeltButton() {
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
    <ExportButton
      label="Melt"
      hint="Convert the binary save to plaintext and download it."
      icon={<FireIcon className="h-4 w-4" />}
      isLoading={isLoading}
      onClick={() => run()}
    />
  );
}
