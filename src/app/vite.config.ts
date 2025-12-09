import { defineConfig } from "vite";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import { reactRouter } from "@react-router/dev/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import tsconfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(() => ({
  plugins: [
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tailwindcss(),
    reactRouter(),
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
  worker: {
    plugins: () => [tsconfigPaths()],
  },
}));
