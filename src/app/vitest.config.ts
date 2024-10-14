import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineWorkersConfig({
  plugins: [tsconfigPaths()],
  test: {
    poolOptions: {
      workers: {
        wrangler: {
          configPath: "./wrangler.toml",
          environment: "test",
        },
      },
    },
    server: {
    deps: {
        inline: ["@remix-run/cloudflare"],
    },
    }
  },
//   server: {
//     deps: {
//       inline: ["@remix-run/cloudflare"],
//     },
//   },
});
