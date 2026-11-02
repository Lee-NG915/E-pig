-- Explicit deployment migration. Never run from a storefront request.
BEGIN;
CREATE TABLE IF NOT EXISTS commerce_carts (
  id text PRIMARY KEY,
  market text NOT NULL,
  creation_key text NOT NULL,
  data jsonb NOT NULL,
  UNIQUE (market, creation_key)
);
CREATE TABLE IF NOT EXISTS commerce_mutations (
  cart_id text NOT NULL REFERENCES commerce_carts(id),
  request_key text NOT NULL,
  signature text NOT NULL,
  result jsonb NOT NULL,
  PRIMARY KEY (cart_id, request_key)
);
CREATE TABLE IF NOT EXISTS commerce_checkouts (
  id text PRIMARY KEY,
  cart_id text NOT NULL REFERENCES commerce_carts(id),
  market text NOT NULL,
  revision integer NOT NULL,
  input_signature text NOT NULL,
  data jsonb NOT NULL,
  payment_request jsonb NOT NULL,
  first_attempt_at timestamptz NOT NULL,
  session_id text UNIQUE,
  UNIQUE (cart_id, revision)
);
CREATE TABLE IF NOT EXISTS commerce_checkout_requests (
  cart_id text NOT NULL REFERENCES commerce_carts(id),
  request_key text NOT NULL,
  signature text NOT NULL,
  checkout_id text NOT NULL REFERENCES commerce_checkouts(id),
  PRIMARY KEY (cart_id, request_key)
);
CREATE TABLE IF NOT EXISTS commerce_orders (
  id text PRIMARY KEY,
  checkout_id text NOT NULL UNIQUE REFERENCES commerce_checkouts(id),
  cart_id text NOT NULL REFERENCES commerce_carts(id),
  market text NOT NULL,
  data jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS commerce_orders_cart_idx ON commerce_orders(cart_id, market);
COMMIT;
