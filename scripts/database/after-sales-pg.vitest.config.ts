import { defineConfig } from "vitest/config";
import baseConfig from "../../vitest.config";

// Explicit, Docker-isolated PostgreSQL 16 check. Never part of ordinary verify.
export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    include: [
      "scripts/database/migrate-lib.spec.mjs",
      "scripts/database/after-sales.migration.spec.ts",
      "scripts/database/after-sales-http-harness.spec.ts",
      "scripts/database/after-sales.http-routes.spec.ts",
      "scripts/database/after-sales.http.spec.ts",
      "scripts/database/after-sales.multiconnection.spec.ts",
      "scripts/database/after-sales-pg-safety.spec.mjs",
      "scripts/database/after-sales-pg-process.spec.mjs",
      "scripts/database/after-sales-browser-sandbox.spec.mjs",
      "scripts/database/run-after-sales-pg.spec.mjs",
    ],
    fileParallelism: false,
    testTimeout: 300_000,
    hookTimeout: 180_000,
    reporters: ["verbose"],
  },
});
