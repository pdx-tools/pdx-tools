import { useState } from "react";
import { Tooltip, Button } from "antd";
import { downloadData } from "@/lib/downloadData";
import { emitEvent } from "@/lib/plausible";
import { DetectedDataType } from "@/features/engine";
import { useIsMounted } from "@/hooks/useIsMounted";

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
  const [loading, setLoading] = useState(false);
  const isMounted = useIsMounted();

  const melt = async () => {
    try {
      setLoading(true);
      emitEvent({ kind: "melt", game });
      const ext = gameExtension(game);
      const meltedName = translateToMeltedFilename(filename, ext);
      const data = await worker.melt();
      downloadData(data, meltedName);
    } finally {
      if (isMounted()) {
        setLoading(false);
      }
    }
  };

  return (
    <Tooltip title="Convert (melt) an ironman save into a normal save">
      <Button loading={loading} onClick={melt}>
        Melt
      </Button>
    </Tooltip>
  );
};
