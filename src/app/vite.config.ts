import { defineConfig } from "vite";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import {
  vitePlugin as remix,
  cloudflareDevProxyVitePlugin,
} from "@remix-run/dev";
import tsconfigPaths from "vite-tsconfig-paths";
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
    // https://discord.com/channels/595317990191398933/773219443911819284/1314241057000657019
    // There is some bug between miniflare and remix when it comes to durable
    // objects, so this sets the environment to test so the error becomes a
    // warning.
    cloudflareDevProxyVitePlugin({
      environment: "test",
      getLoadContext,
    }),
    remix({
      future: {
        v3_fetcherPersist: true,
        v3_relativeSplatPath: true,
        v3_throwAbortReason: true,
        v3_singleFetch: true,
        v3_lazyRouteDiscovery: true,
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
        "cloudflare:workers": path.resolve(
          __dirname,
          "./tests/durableObjectsMock.ts",
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
      external: ["wasm_app_bg.wasm", "cloudflare:workers", "perf_hooks"],
    },
  },
  server: {
    // Need to transition to monorepo and then we can get rid of this
    fs: {
      allow: ["../.."],
    },
  },
}));
