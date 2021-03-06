import { useState } from "react";
import { Tooltip, Button } from "antd";
import { useSelector } from "react-redux";
import { selectAnalyzeFileName, useWasmWorker } from "@/features/engine";
import { downloadData } from "@/lib/downloadData";
import { translateToMeltedFilename } from "@/lib/translateMeltedFilename";
import { emitEvent } from "@/lib/plausible";

export const MeltButton = () => {
  const [loading, setLoading] = useState(false);
  const filename = useSelector(selectAnalyzeFileName);
  const wasmWorker = useWasmWorker();

  const melt = async () => {
    if (!wasmWorker.current) {
      return;
    }

    try {
      setLoading(true);
      emitEvent({ kind: "melt", game: "ck3" });
      const meltedName = translateToMeltedFilename(filename, "ck3");
      const data = await wasmWorker.current.worker.ck3Melt();
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
