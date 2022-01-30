import { emitEvent } from "@/lib/plausible";
import { Alert } from "antd";
import { useEffect, useState } from "react";

export const BrowserCheck: React.FC<{}> = () => {
  const [warnings, setWarnings] = useState<string[]>([]);

  useEffect(() => {
    const gl = document.createElement("canvas").getContext("webgl2");
    const requiredSize = 8192;
    const maxTextureSize = gl ? gl.getParameter(gl.MAX_TEXTURE_SIZE) : 0;
    if (!gl) {
      setWarnings((x) => [...x, "WebGL2 not available"]);
    } else if (maxTextureSize < requiredSize) {
      setWarnings((x) => [
        ...x,
        `WebGL2 max texture size (${maxTextureSize}) is smaller than required (${requiredSize})`,
      ]);
    }

    emitEvent({ kind: "webgl", maxTextureSize });
  }, []);

  useEffect(() => {
    const supported = typeof WebAssembly?.instantiate === "function";
    if (!supported) {
      setWarnings((x) => [...x, "WebAssembly not available"]);
    }
  }, []);

  if (warnings.length === 0) {
    return null;
  }

  return (
    <Alert
      type="error"
      message={`Your browser is not supported due to ${warnings.join(" and ")}`}
    />
  );
};
