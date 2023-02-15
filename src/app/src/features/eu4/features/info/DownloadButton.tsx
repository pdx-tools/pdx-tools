import React, { useState } from "react";
import { Button, Tooltip } from "antd";
import { emitEvent } from "@/lib/plausible";
import { downloadData } from "@/lib/downloadData";
import { useIsMounted } from "@/hooks/useIsMounted";
import { getEu4Worker } from "../../worker";
import { useSaveFilename } from "../../Eu4SaveProvider";

export const DownloadButton = () => {
  const [loading, setLoading] = useState(false);
  const filename = useSaveFilename();
  const isMounted = useIsMounted();

  const download = async () => {
    try {
      setLoading(true);
      emitEvent({ kind: "download", game: "eu4" });
      const data = await getEu4Worker().eu4DownloadData();
      downloadData(data, filename);
    } finally {
      if (isMounted()) {
        setLoading(false);
      }
    }
  };

  return (
    <Tooltip title="Download the EU4 save">
      <Button loading={loading} onClick={download}>
        Download
      </Button>
    </Tooltip>
  );
};
