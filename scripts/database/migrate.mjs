import {
  GENERIC_FAILURE,
  normalizeDriver,
  parseMigrateArgs,
  runMigrations,
} from "./migrate-lib.mjs";

let options;
try {
  options = parseMigrateArgs(process.argv.slice(2));
  normalizeDriver(process.env.DATABASE_DRIVER);
} catch (error) {
  console.error(`Migration failed: ${error instanceof Error ? error.message : "invalid arguments"}`);
  process.exitCode = 1;
}

if (!process.exitCode) {
  if (!process.env.DATABASE_URL) {
    console.error("Migration failed: DATABASE_URL is required; no fallback database exists");
    process.exitCode = 1;
  } else {
    try {
      const applied = await runMigrations({
        connectionString: process.env.DATABASE_URL,
        driver: normalizeDriver(process.env.DATABASE_DRIVER),
        scope: options.scope,
      });
      console.log(
        `Commerce schema migration complete scope=${options.scope} files=${applied.join(",")}`,
      );
    } catch {
      // Never print the driver error: it may contain caller-supplied connection
      // details. The caller should inspect database connectivity/permissions.
      console.error(GENERIC_FAILURE);
      process.exitCode = 1;
    }
  }
}
