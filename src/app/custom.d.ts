declare module "*.wasm?module" {
  const content: WebAssembly.Module;
  export default content;
}
  