import { defineConfig } from "vitest/config";
import baseConfig from "../../vitest.config";

// Explicit, Docker-isolated PostgreSQL 16 check. Never part of ordinary verify.
export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    include: [
      "scripts/database/after-sales.multiconnection.spec.ts",
      "scripts/database/after-sales-pg-safety.spec.mjs",
      "scripts/database/after-sales-pg-process.spec.mjs",
      "scripts/database/run-after-sales-pg.spec.mjs",
    ],
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 60_000,
    reporters: ["verbose"],
  },
});
