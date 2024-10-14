import { compatibilityReport } from "@/lib/compatibility";
import { useEffect, useState } from "react";
import { Alert } from "../Alert";

export const BrowserCheck = () => {
  const [warnings, setWarnings] = useState<string[]>([]);

  useEffect(() => {
    const report = compatibilityReport();
    if (!report.offscreen.enabled) {
      setWarnings((x) => [
        ...x,
        `Unable to create a WebGL2 OffscreenCanvas. Upgrade the browser to the latest version`,
      ]);
    }

    if (!report.webgl2.enabled) {
      setWarnings((x) => [...x, "WebGL2 not available"]);
    } else if (report.webgl2.textureSize.tooSmall) {
      const msg = `WebGL2 max texture size (${report.webgl2.textureSize.actual}) is smaller than required (${report.webgl2.textureSize.required})`;
      setWarnings((x) => [...x, msg]);
    } else if (report.webgl2.performanceCaveat) {
      setWarnings((x) => [
        ...x,
        `WebGL2 major performance caveat detected. Is hardware acceleration turned off?`,
      ]);
    }

    if (!report.wasm) {
      setWarnings((x) => [...x, `WebAssembly not available`]);
    }
  }, []);

  if (warnings.length === 0) {
    return null;
  }

  return (
    <Alert variant="error" className="p-4">
      <Alert.Description>
        Your browser is not supported due to:
        <ul className="m-0">
          {warnings.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      </Alert.Description>
    </Alert>
  );
};
