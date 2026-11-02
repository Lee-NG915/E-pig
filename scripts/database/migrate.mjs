import { readFile } from "node:fs/promises";
import { Pool, neonConfig } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required; no fallback database exists");
neonConfig.webSocketConstructor = WebSocket;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
try {
  await pool.query(await readFile(new URL("./001-commerce.sql", import.meta.url), "utf8"));
  console.log("Commerce schema migration complete");
} catch {
  console.error("Commerce migration failed; check database connectivity and migration permissions");
  process.exitCode = 1;
} finally {
  await pool.end();
}
