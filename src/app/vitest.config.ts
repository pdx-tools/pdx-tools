import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    testTimeout: 60000,
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["app/**/*.test.{ts,tsx}", "tests/**/*.test.ts"],
          exclude: [...configDefaults.exclude, "tests/api*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/api*.test.ts"],
          globalSetup: "./tests/globalSetup.ts",
        },
      },
    ],
  },
});
