import { defineConfig } from '@tanstack/start/config'
import tsConfigPaths from 'vite-tsconfig-paths'
import { rollup as unwasm } from "unwasm/plugin";

export default defineConfig({
  server: {
    preset: "cloudflare-pages",
  },
  vite: {
    plugins: [
      tsConfigPaths(),
      unwasm({}),
    ],
    worker: {
      plugins: () => [tsConfigPaths()]
    }
  },
})
