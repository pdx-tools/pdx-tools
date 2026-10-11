import { defineConfig, devices } from "@playwright/test";

// The tests run against the stack that `mise run test:app` starts: the app
// preview on port 3000 and the parse API on port 8081.
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./tests/globalSetup.ts",
  // All tests share one database, which each test resets.
  workers: 1,
  fullyParallel: false,
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
