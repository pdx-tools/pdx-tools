export function isWebGPUSupported(): boolean {
  // navigator.gpu is the entry point for WebGPU
  // https://codelabs.developers.google.com/your-first-webgpu-app#2
  return "gpu" in navigator;
}
