-- GitHub consumer identities: bind one GitHub subject to one or more cart ids.
-- Orders stay keyed by cart_id; the mapping only defines which carts a
-- signed-in GitHub user may read. No passwords or tokens are stored here.
CREATE TABLE IF NOT EXISTS consumer_identities (
  github_id TEXT NOT NULL,
  cart_id UUID NOT NULL,
  login TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (github_id, cart_id)
);

CREATE INDEX IF NOT EXISTS ix_consumer_identities_cart ON consumer_identities(cart_id);
