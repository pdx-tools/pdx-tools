import React, { useState } from "react";
import { Button, Tooltip } from "antd";
import { selectAnalyzeFileName, useWasmWorker } from "@/features/engine";
import { useSelector } from "react-redux";
import { emitEvent } from "@/lib/plausible";
import { downloadData } from "@/lib/downloadData";

export const DownloadButton: React.FC<{}> = () => {
  const [loading, setLoading] = useState(false);
  const filename = useSelector(selectAnalyzeFileName);
  const wasmWorker = useWasmWorker();

  const download = async () => {
    if (!wasmWorker.current) {
      return;
    }

    try {
      setLoading(true);
      emitEvent({ kind: "download", game: "eu4" });
      const data = await wasmWorker.current.worker.eu4DownloadData();
      downloadData(data, filename);
    } finally {
      setLoading(false);
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
