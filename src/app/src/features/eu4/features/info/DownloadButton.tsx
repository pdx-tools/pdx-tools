import React, { useState } from "react";
import { emitEvent } from "@/lib/plausible";
import { downloadData } from "@/lib/downloadData";
import { useIsMounted } from "@/hooks/useIsMounted";
import { getEu4Worker } from "../../worker";
import { useSaveFilename } from "../../store";
import { useCompression } from "@/features/compress";
import { Button } from "@/components/Button";
import { Tooltip } from "@/components/Tooltip";
import { LoadingIcon } from "@/components/icons/LoadingIcon";
import { useTriggeredAction } from "@/hooks/useTriggeredAction";

export const DownloadButton = () => {
  const compressWorker = useCompression();
  const filename = useSaveFilename();
  const { isLoading: loading, run: download } = useTriggeredAction({
    action: async () => {
      emitEvent({ kind: "download", game: "eu4" });
      const raw = await getEu4Worker().getRawData();
      const data = await compressWorker.transform(raw);
      downloadData(data, filename);
    },
  });

  return (
    <Tooltip>
      <Tooltip.Trigger asChild>
        <Button className="flex gap-2" onClick={download}>
          {loading ? <LoadingIcon className="h-4 w-4 text-gray-800" /> : null}{" "}
          <span>Download</span>
        </Button>
      </Tooltip.Trigger>
      <Tooltip.Content>Download the EU4 save</Tooltip.Content>
    </Tooltip>
  );
};
