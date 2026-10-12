import { defineConfig, devices } from "@playwright/test";

// Browser tests require the database services started by `mise run test:app:e2e`.
export default defineConfig({
  testDir: "./e2e",
  // All tests share one database, which each test resets.
  workers: 1,
  forbidOnly: !!process.env.CI,
  timeout: 120_000,
  expect: { timeout: 30_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:3000",
    actionTimeout: 15_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "mise run serve:api:test",
      url: "http://localhost:8081/healthz",
      reuseExistingServer: !process.env.CI,

      timeout: 300_000,
    },
    {
      command: "pnpm run preview --mode test --strictPort",
      url: "http://localhost:3000",
      reuseExistingServer: !process.env.CI,
    },
  ],
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          // Use software rendering; SwiftShader is too slow for EU4 on Linux.
          args: [
            "--enable-unsafe-webgpu",
            "--enable-features=Vulkan",
            process.platform === "linux" ? "--use-angle=vulkan" : "--use-angle=swiftshader",
            "--ignore-gpu-blocklist",
          ],
        },
      },
    },
  ],
});
