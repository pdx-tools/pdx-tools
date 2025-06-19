import { defineConfig } from "vite";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import { reactRouter } from "@react-router/dev/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import path from "node:path";

export default defineConfig(({ mode }) => ({
  optimizeDeps: {
    exclude: ["react-router-dom"],
  },
  plugins: [
    tailwindcss(),
    reactRouter(),
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tsconfigPaths(),
  ].concat(
    process.env.PDX_RELEASE
      ? [
          sentryVitePlugin({
            telemetry: false,
            authToken: process.env.SENTRY_AUTH_TOKEN,
            org: process.env.SENTRY_ORG,
            project: process.env.SENTRY_PROJECT,
            disable: !process.env.SENTRY_AUTH_TOKEN,
          }),
        ]
      : [],
  ),
  ssr: {
    resolve: {
      conditions: ["workerd", "worker", "browser"],
    },
  },
  resolve: {
    mainFields: ["browser", "module", "main"],
    alias: {
      // https://github.com/remix-run/remix/issues/9245#issuecomment-2179517678
      ...(mode === "development" && {
        postgres: path.resolve(
          __dirname,
          "./node_modules/postgres/src/index.js",
        ),
      }),
    },
  },
  worker: {
    plugins: () => [tsconfigPaths()],
  },
  build: {
    minify: true,
    sourcemap: "hidden",
    target: "es2022",
    rollupOptions: {
      output: {
        paths: { "wasm_app_bg.wasm": "./wasm_app_bg.wasm" },
      },
      external: ["wasm_app_bg.wasm"],
    },
  },
}));
