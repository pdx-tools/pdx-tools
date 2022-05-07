import { compatibilityReport } from "@/lib/compatibility";
import { Alert } from "antd";
import { useEffect, useState } from "react";

export const BrowserCheck = () => {
  const [warnings, setWarnings] = useState<string[]>([]);

  useEffect(() => {
    const report = compatibilityReport();

    const browser = report.browser.webkit;
    if (browser?.supported === false) {
      setWarnings((x) => [
        ...x,
        `Unsupported ${browser.kind} version (${
          browser?.version ?? "unknown"
        }). Requires: ${
          browser.required
        }. If on iPad or iPhone, upgrade to iOS 15.2. If on desktop, either use a different browser or upgrade to the latest macOS version`,
      ]);
    }

    if (!report.webgl2.enabled) {
      setWarnings((x) => [...x, "WebGL2 not available"]);
    } else if (report.webgl2.textureSize.tooSmall) {
      const msg = `WebGL2 max texture size (${report.webgl2.textureSize.actual}) is smaller than required (${report.webgl2.textureSize.required})`;
      setWarnings((x) => [...x, msg]);
    } else if (report.webgl2.performanceCaveat) {
      setWarnings((x) => [...x, `WebGL2 major performance caveat detected`]);
    }

    if (!report.wasm) {
      setWarnings((x) => [...x, `WebAssembly not available`]);
    }
  }, []);

  if (warnings.length === 0) {
    return null;
  }

  return (
    <Alert
      type="error"
      closable
      message={
        <div>
          Your browser is not supported due to:
          <ul>
            {warnings.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
          <style jsx>{`
            ul {
              margin: 0;
            }
          `}</style>
        </div>
      }
    />
  );
};
