import { useState } from "react";
import { cx } from "class-variance-authority";
import { ArrowUpTrayIcon, CameraIcon } from "@heroicons/react/24/outline";
import { FireIcon } from "@heroicons/react/24/solid";
import { LoadingIcon } from "@/components/icons/LoadingIcon";
import { focusRing } from "@/components/game/focusRing";
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
  useEu5SaveInput,
} from "../store";
import { useSession } from "@/features/account";
import { hasFeature } from "@/lib/auth";
import { pdxApi } from "@/services/appApi";
import { Dialog } from "@/components/Dialog";
import { Button } from "@/components/Button";
import { Link } from "@/components/Link";

type ActionDef = {
  id: string;
  label: string;
  hint: string;
};

const ACTION_DEFS: ActionDef[] = [
  { id: "screenshot", label: "Capture screenshot", hint: "shift · full res" },
  { id: "melt", label: "Melt save file", hint: "binary → plaintext" },
  { id: "upload", label: "Upload save", hint: "public permalink" },
];

export function ActionsRail() {
  const [hoveredAction, setHoveredAction] = useState<ActionDef | null>(null);
  const session = useSession();
  const save = useEu5SaveInput();
  const canUpload = save.kind !== "server" && hasFeature(session, "eu5-upload");

  return (
    <div className="shrink-0">
      <div className="flex h-8 items-center px-3.5">
        {hoveredAction ? (
          <div className="flex w-full items-baseline justify-between gap-2">
            <span className="text-[12px] text-game-ink-300">{hoveredAction.label}</span>
            <span className="font-mono text-[10px] text-game-ink-500">{hoveredAction.hint}</span>
          </div>
        ) : (
          <span className="font-mono text-[10px] text-game-ink-500 italic">Hover an action</span>
        )}
      </div>

      <div className="flex h-12 items-center justify-center gap-2 border-t border-game-line">
        <ScreenshotButton def={ACTION_DEFS[0]} onHover={setHoveredAction} />
        <MeltButton def={ACTION_DEFS[1]} onHover={setHoveredAction} />
        {canUpload ? <UploadButton def={ACTION_DEFS[2]} onHover={setHoveredAction} /> : null}
      </div>
    </div>
  );
}

function UploadButton({
  def,
  onHover,
}: {
  def: ActionDef;
  onHover: (d: ActionDef | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [progress, setProgress] = useState(0);
  const save = useEu5SaveInput();
  const filename = useSaveFilename();
  const upload = pdxApi.eu5Saves.useAdd();

  const startUpload = () => {
    setProgress(0);
    upload.mutate({ save, filename, dispatch: setProgress });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <ActionButton
        def={def}
        onHover={onHover}
        isLoading={upload.isPending}
        onClick={() => setOpen(true)}
      >
        <ArrowUpTrayIcon className="h-4 w-4" />
      </ActionButton>
      <Dialog.Content className="border-game-line-strong bg-game-panel font-game-ui text-game-ink-100">
        <Dialog.Header>
          <Dialog.Title>Upload {filename}</Dialog.Title>
          <Dialog.Description className="text-game-ink-300">
            This save and its permalink will be public. The file is recompressed with zstd before it
            leaves your browser.
          </Dialog.Description>
        </Dialog.Header>

        {upload.isPending ? (
          <div className="space-y-2">
            <div className="h-2 overflow-hidden rounded bg-game-line">
              <div
                className="h-full bg-game-accent-300 transition-[width]"
                style={{ width: `${Math.max(2, progress)}%` }}
              />
            </div>
            <p className="text-xs text-game-ink-500">{Math.round(progress)}%</p>
          </div>
        ) : null}

        {upload.error ? (
          <p className="text-sm text-red-400">{getErrorMessage(upload.error)}</p>
        ) : null}

        {upload.data ? (
          <p className="text-sm">
            Save uploaded.{" "}
            <Link href={`/eu5/saves/${upload.data.save_id}`} className="font-semibold">
              Open permalink
            </Link>
          </p>
        ) : null}

        <Dialog.Footer>
          <Dialog.Close asChild>
            <Button variant="default" disabled={upload.isPending}>
              Close
            </Button>
          </Dialog.Close>
          {!upload.data ? (
            <Button variant="primary" disabled={upload.isPending} onClick={startUpload}>
              Upload
            </Button>
          ) : null}
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
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
        "text-game-ink-500 hover:bg-game-panel-hover hover:text-game-ink-100",
        focusRing,
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
