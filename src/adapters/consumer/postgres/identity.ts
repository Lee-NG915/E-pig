import "server-only";

import type { CommerceQuery } from "@/adapters/commerce/postgres/pool";

export interface ConsumerIdentityStore {
  bind(githubId: string, login: string, cartId: string): Promise<void>;
  listCartIds(githubId: string): Promise<string[]>;
}

/** GitHub-subject to cart bindings; the only authority for cross-device order reads. */
export function createConsumerIdentityStore(db: CommerceQuery): ConsumerIdentityStore {
  return {
    async bind(githubId, login, cartId) {
      await db.query(
        "INSERT INTO consumer_identities (github_id, login, cart_id) VALUES ($1, $2, $3) ON CONFLICT (github_id, cart_id) DO NOTHING",
        [githubId, login, cartId],
      );
    },
    async listCartIds(githubId) {
      const { rows } = await db.query(
        "SELECT cart_id FROM consumer_identities WHERE github_id = $1",
        [githubId],
      );
      return rows.map((row) => row.cart_id as string);
    },
  };
}
