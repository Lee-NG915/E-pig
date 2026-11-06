-- Explicit deployment migration. Never run from a storefront request.
BEGIN;
CREATE TABLE IF NOT EXISTS after_sales_request_counters (
  market text PRIMARY KEY,
  sequence bigint NOT NULL DEFAULT 0 CHECK (sequence >= 0)
);
CREATE TABLE IF NOT EXISTS after_sales_requests (
  id text PRIMARY KEY,
  market text NOT NULL,
  cart_id text NOT NULL,
  order_id text NOT NULL,
  creation_key text NOT NULL,
  fingerprint text NOT NULL,
  sequence bigint NOT NULL CHECK (sequence > 0),
  data jsonb NOT NULL,
  UNIQUE (market, cart_id, creation_key),
  UNIQUE (market, sequence)
);
COMMIT;
