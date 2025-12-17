import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./app/server-lib/db/schema.ts",
  out: "./migrations",
});
