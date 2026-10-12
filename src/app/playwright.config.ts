import { defineConfig, devices } from "@playwright/test";

// Playwright starts the parse API and the app preview. The database and the
// other services must run before the tests start (`mise run test:app:e2e`).
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
      // The first start can compile the API.
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
          // Headless Chromium has no WebGPU adapter. Without SwiftShader the
          // EU5 load stops before the UI mounts.
          args: [
            "--enable-unsafe-webgpu",
            "--enable-features=Vulkan",
            "--use-angle=swiftshader",
            "--ignore-gpu-blocklist",
          ],
        },
      },
    },
  ],
});
