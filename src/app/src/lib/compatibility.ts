import { glContext } from "@/features/eu4/features/map/resources";
import { emitEvent } from "./plausible";

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
  kind: "webkit" | "safari";
  version: string | null;
  required: string;
  supported: boolean;
};

let report: CompatibilityReport | undefined = undefined;

function webgl2Compatibility(): WegblCompatibility {
  const canvas = document.createElement("canvas");
  const gl = glContext(canvas);

  if (!gl) {
    canvas.remove();
    return { enabled: false };
  }

  const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
  const requiredTextureSize = 4096;
  const performanceCaveat = !glContext(canvas, {
    failIfMajorPerformanceCaveat: true,
  });

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

// Versions of safari / webkit known to handle our webgl2 shaders.
const MINIMUM_WEBKIT = "605.1";
const MINIMUM_SAFARI = "15.2";

export function userAgentCompatibility(ua: string): BrowserCompatibility {
  if (!ua.includes("Safari")) {
    return {};
  }

  if (ua.includes("Android")) {
    return {};
  }

  const vere = /Version\/([0-9]+\.[0-9]+)/;
  const matches = ua.match(vere);

  if (matches === null) {
    const safre = /Safari\/([0-9]+\.[0-9]+)/;
    const safmatches = ua.match(safre);
    if (safmatches === null) {
      return {};
    } else {
      const version = safmatches[1] ?? null;
      const unsupported = +(version ?? 0) < +MINIMUM_WEBKIT;
      return {
        webkit: {
          kind: "webkit",
          version,
          required: MINIMUM_WEBKIT,
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
  const maxTextureSize = webgl2.enabled ? webgl2.textureSize.actual : null;
  const performanceCaveat = webgl2.enabled ? webgl2.performanceCaveat : null;

  emitEvent({ kind: "webgl", maxTextureSize, performanceCaveat });

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
