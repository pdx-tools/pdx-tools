import { Button, Tooltip } from "antd";
import React, { useState } from "react";
import { useSelector } from "react-redux";
import { downloadData } from "@/lib/downloadData";
import { emitEvent } from "@/lib/plausible";
import { selectAnalyzeFileName, useWasmWorker } from "@/features/engine";
import { translateToMeltedFilename } from "@/lib/translateMeltedFilename";

export const MeltButton: React.FC<{}> = () => {
  const [loading, setLoading] = useState(false);
  const filename = useSelector(selectAnalyzeFileName);
  const wasmWorker = useWasmWorker();

  const melt = async () => {
    if (!wasmWorker.current) {
      return;
    }

    try {
      setLoading(true);
      emitEvent("Melt");
      const meltedName = translateToMeltedFilename(filename, "eu4");
      const data = await wasmWorker.current.worker.eu4Melt();
      downloadData(data, meltedName);
    } finally {
      setLoading(false);
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
