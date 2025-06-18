import { defineConfig } from "vite";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import {
  vitePlugin as remix,
  cloudflareDevProxyVitePlugin,
} from "@remix-run/dev";
import tsconfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import { getLoadContext } from "./load-context";
import path from "node:path";

// https://remix.run/docs/en/main/guides/single-fetch#enable-single-fetch-types
declare module "@remix-run/cloudflare" {
  interface Future {
    v3_singleFetch: true;
  }
}

export default defineConfig(({ mode }) => ({
  plugins: [
    tailwindcss(),
    cloudflareDevProxyVitePlugin({
      getLoadContext,
    }),
    remix({
      future: {
        v3_fetcherPersist: true,
        v3_relativeSplatPath: true,
        v3_throwAbortReason: true,
        v3_singleFetch: true,
        v3_lazyRouteDiscovery: true,
        v3_routeConfig: true,
      },
    }),
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
