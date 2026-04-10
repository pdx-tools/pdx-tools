import { defineConfig } from "vite";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import { reactRouter } from "@react-router/dev/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(() => ({
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [cloudflare({ viteEnvironment: { name: "ssr" } }), tailwindcss(), reactRouter()].concat(
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
}));
