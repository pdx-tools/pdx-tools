import { glContext } from "@/features/eu4/features/map/resources";
import { emitEvent } from "./events";

export interface CompatibilityReport {
  webgl2: WegblCompatibility;
  wasm: boolean;
  browser: BrowserCompatibility;
}

export type WegblCompatibility =
  | {
      enabled: true;
      textureSize: {
        actual: number;
        required: number;
        tooSmall: boolean;
      };
      performanceCaveat: boolean;
    }
  | {
      enabled: false;
    };

export type BrowserCompatibility = {
  webkit?: WebkitCompatibility;
};

export type WebkitCompatibility = {
  kind: "ios" | "safari";
  version: string | null;
  required: string;
  supported: boolean;
};

let report: CompatibilityReport | undefined = undefined;

function webgl2Compatibility(): WegblCompatibility {
  const canvas = document.createElement("canvas");
  const performanceCaveat = !glContext(canvas, {
    failIfMajorPerformanceCaveat: true,
  });

  const gl = glContext(canvas);
  if (!gl) {
    canvas.remove();
    return { enabled: false };
  }

  const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
  const requiredTextureSize = 4096;

  canvas.remove();
  return {
    enabled: true,
    textureSize: {
      actual: maxTextureSize,
      required: requiredTextureSize,
      tooSmall: requiredTextureSize > maxTextureSize,
    },
    performanceCaveat,
  };
}

function wasmCompatibility() {
  return window.WebAssembly !== undefined;
}

// Versions of safari known to handle our webgl2 shaders.
const MINIMUM_SAFARI = "15.2";

export function userAgentCompatibility(ua: string): BrowserCompatibility {
  if (!ua.includes("Safari")) {
    return {};
  }

  if (!ua.includes("Mac OS")) {
    return {};
  }

  const vere = /Version\/([0-9]+\.[0-9]+)/;
  const matches = ua.match(vere);

  if (matches === null) {
    const osre = /OS ([0-9]+_[0-9]+)/;
    const osMatches = ua.match(osre);
    if (osMatches === null) {
      return {};
    } else {
      const version = osMatches[1]?.replace(/_/g, ".") ?? null;
      const unsupported = +(version ?? 0) < +MINIMUM_SAFARI;
      return {
        webkit: {
          kind: "ios",
          version,
          required: MINIMUM_SAFARI,
          supported: !unsupported,
        },
      };
    }
  } else {
    const version = matches[1] ?? null;
    const unsupported = +(version ?? 0) < +MINIMUM_SAFARI;

    return {
      webkit: {
        kind: "safari",
        version,
        required: MINIMUM_SAFARI,
        supported: !unsupported,
      },
    };
  }
}

function browserCompatibility(): BrowserCompatibility {
  const ua = navigator.userAgent;
  return userAgentCompatibility(ua);
}

function genReport(): CompatibilityReport {
  const webgl2 = webgl2Compatibility();

  return {
    webgl2,
    wasm: wasmCompatibility(),
    browser: browserCompatibility(),
  };
}

export function compatibilityReport(): CompatibilityReport {
  return report ?? (report = genReport());
}

export function isEnvironmentSupported() {
  const report = compatibilityReport();

  return (
    report.webgl2.enabled &&
    report.webgl2.performanceCaveat === false &&
    report.webgl2.textureSize.tooSmall === false &&
    report.wasm &&
    report.browser.webkit?.supported !== false
  );
}
