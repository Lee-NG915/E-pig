import { describe, expect, it, vi } from "vitest";

import { createConsumerIdentityStore } from "./identity";

function db() {
  return { query: vi.fn().mockResolvedValue({ rows: [{ cart_id: "cart-a" }, { cart_id: "cart-b" }] }) };
}

describe("consumer identity store", () => {
  it("binds a GitHub subject to a cart without duplicating bindings", async () => {
    const database = db();
    await createConsumerIdentityStore(database).bind("55341019", "Lee-NG915", "cart-a");
    const [sql, values] = database.query.mock.calls[0];
    expect(sql).toContain("ON CONFLICT (github_id, cart_id) DO NOTHING");
    expect(values).toEqual(["55341019", "Lee-NG915", "cart-a"]);
  });

  it("lists every cart bound to the subject", async () => {
    const database = db();
    const cartIds = await createConsumerIdentityStore(database).listCartIds("55341019");
    expect(cartIds).toEqual(["cart-a", "cart-b"]);
    expect(database.query.mock.calls[0][1]).toEqual(["55341019"]);
  });
});
