import { glContext } from "@/features/eu4/features/map/resources";

export interface CompatibilityReport {
  webgl2: WegblCompatibility;
  wasm: boolean;
  offscreen: { enabled: boolean };
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

function offscreenCompatibility() {
  try {
    const canvas = new OffscreenCanvas(100, 100);
    const ctx = canvas.getContext("webgl2");
    return { enabled: ctx !== null };
  } catch (ex) {
    return { enabled: false };
  }
}

function genReport(): CompatibilityReport {
  return {
    webgl2: webgl2Compatibility(),
    wasm: wasmCompatibility(),
    offscreen: offscreenCompatibility(),
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
    report.offscreen.enabled
  );
}
