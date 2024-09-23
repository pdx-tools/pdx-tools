import { downloadData } from "@/lib/downloadData";
import { emitEvent } from "@/lib/events";
import { DetectedDataType } from "@/features/engine";
import { Button } from "./Button";
import { Tooltip } from "./Tooltip";
import { LoadingIcon } from "./icons/LoadingIcon";
import { useTriggeredAction } from "@/hooks/useTriggeredAction";

type MeltProps = {
  filename: string;
  game: DetectedDataType;
  worker: {
    melt(): Promise<Uint8Array>;
  };
};

function gameExtension(game: DetectedDataType) {
  switch (game) {
    case "vic3":
      return "v3";
    case "imperator":
      return "rome";
    default:
      return game;
  }
}

function translateToMeltedFilename(filename: string, extension: string) {
  const fn = filename;
  const ind = fn.lastIndexOf(".");
  if (ind == -1) {
    return `${fn}_melted.${extension}`;
  } else {
    return `${fn.substring(0, ind)}_melted.${extension}`;
  }
}

export const MeltButton = ({ filename, worker, game }: MeltProps) => {
  const { isLoading: loading, run: melt } = useTriggeredAction({
    action: () => meltSave(game, filename, worker),
  });

  return (
    <Tooltip>
      <Tooltip.Trigger asChild>
        <Button className="flex gap-2 self-start" onClick={melt}>
          {loading ? <LoadingIcon className="h-4 w-4 text-gray-800" /> : null}{" "}
          <span>Melt</span>
        </Button>
      </Tooltip.Trigger>
      <Tooltip.Content>Convert (melt) save into plain text</Tooltip.Content>
    </Tooltip>
  );
};

export async function meltSave(
  game: DetectedDataType,
  filename: string,
  worker: { melt(): Promise<Uint8Array> },
) {
  const ext = gameExtension(game);
  const meltedName = translateToMeltedFilename(filename, ext);
  const data = await worker.melt();
  emitEvent({ kind: "Save melted", game });
  downloadData(data, meltedName);
}
