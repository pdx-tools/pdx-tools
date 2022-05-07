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
      emitEvent({ kind: "melt", game: "imperator" });
      const meltedName = translateToMeltedFilename(filename, "rome");
      const data = await wasmWorker.current.worker.imperatorMelt();
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
