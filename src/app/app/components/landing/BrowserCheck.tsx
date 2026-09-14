import { compatibilityReport } from "@/lib/compatibility";
import { useSyncExternalStore } from "react";
import { Alert } from "../Alert";

const emptySubscribe = () => () => {};
const noWarnings: string[] = [];
let cachedWarnings: string[] | undefined;

function getWarnings() {
  if (cachedWarnings) return cachedWarnings;

  const report = compatibilityReport();
  const warnings: string[] = [];
  if (!report.offscreen.enabled) {
    warnings.push(
      "Unable to create a WebGL2 OffscreenCanvas. Upgrade the browser to the latest version",
    );
  }

  if (!report.webgl2.enabled) {
    warnings.push("WebGL2 not available");
  } else if (report.webgl2.textureSize.tooSmall) {
    warnings.push(
      `WebGL2 max texture size (${report.webgl2.textureSize.actual}) is smaller than required (${report.webgl2.textureSize.required})`,
    );
  } else if (report.webgl2.performanceCaveat) {
    warnings.push("WebGL2 major performance caveat detected. Is hardware acceleration turned off?");
  }

  if (!report.wasm) {
    warnings.push("WebAssembly not available");
  }

  cachedWarnings = warnings;
  return warnings;
}

export const BrowserCheck = () => {
  const warnings = useSyncExternalStore(emptySubscribe, getWarnings, () => noWarnings);

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
