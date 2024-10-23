import { defineConfig } from "@tanstack/start/config";
import tsConfigPaths from "vite-tsconfig-paths";
import { rollup as unwasm } from "unwasm/plugin";

export default defineConfig({
  server: {
    preset: "cloudflare-pages",
    routeRules: {
      "/api/tunnel": {
        proxy: {
          to: `https://${process.env.SENTRY_HOST}/api/${process.env.SENTRY_PROJECT_ID}/envelope/`,
        },
      },
    },
  },
  vite: {
    plugins: [tsConfigPaths(), unwasm({})],
    worker: {
      plugins: () => [tsConfigPaths()],
    },
  },
});
