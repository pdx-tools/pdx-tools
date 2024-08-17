import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server-lib/db/schema.ts",
  out: "./migrations",
});
