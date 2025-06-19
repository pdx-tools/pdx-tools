declare module "*.wasm?module" {
  const content: WebAssembly.Module;
  export default content;
}

declare global {
  interface CacheStorage {
    readonly default: Cache;
  }
}
