import { Alert } from "antd";
import { useEffect, useState } from "react";

export const BrowserCheck: React.FC<{}> = () => {
  const [warnings, setWarnings] = useState<string[]>([]);

  useEffect(() => {
    const gl = document.createElement("canvas").getContext("webgl2");
    if (!gl) {
      setWarnings((x) => [...x, "WebGL2 not available"]);
    }
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
