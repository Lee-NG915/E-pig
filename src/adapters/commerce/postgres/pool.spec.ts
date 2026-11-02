import { Pool } from "@neondatabase/serverless";
import { afterEach, expect, it, vi } from "vitest";
import { createCommercePool } from "./pool";

afterEach(() => vi.restoreAllMocks());

it("handles repeated idle connection errors without leaking credentials", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const pool = createCommercePool("postgres://buyer:secret@db.example/shop") as Pool;
  const error = Object.assign(new Error("Disconnected postgres://buyer:secret@db.example/shop"), {
    code: "08006",
    detail: "secret connection configuration",
  });
  try {
    expect(() => pool.emit("error", error)).not.toThrow();
    expect(() => pool.emit("error", error)).not.toThrow();
    expect(log).toHaveBeenCalledTimes(2);
    const record = JSON.parse(log.mock.calls[0][0]);
    expect(record).toMatchObject({ level: "error", event: "commerce.pool_idle_error" });
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/secret|buyer|db\.example|postgres:/);
  } finally {
    await pool.end();
  }
});

it("requires configured database credentials", () => {
  expect(() => createCommercePool("")).toThrow("Commerce database is not configured");
});
