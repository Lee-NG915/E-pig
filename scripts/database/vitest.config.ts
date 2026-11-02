import { defineConfig } from "vitest/config";
import baseConfig from "../../vitest.config";

// Explicit external database check, excluded from ordinary local/CI unit tests.
export default defineConfig({
  ...baseConfig,
  test: { ...baseConfig.test, include: ["scripts/database/concurrency.spec.ts"] },
});
