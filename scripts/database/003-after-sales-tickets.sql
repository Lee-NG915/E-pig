-- Explicit deployment migration. Never run from a storefront request.
BEGIN;
CREATE TABLE IF NOT EXISTS after_sales_attachments (
  id text PRIMARY KEY,
  market text NOT NULL,
  order_id text NOT NULL,
  cart_id text NOT NULL,
  file_name text NOT NULL,
  media_type text NOT NULL CHECK (media_type IN ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 5242880),
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  bytes bytea NOT NULL,
  CHECK (octet_length(bytes) = size_bytes),
  CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS after_sales_attachments_owner_idx
  ON after_sales_attachments(market, order_id, cart_id);
CREATE TABLE IF NOT EXISTS after_sales_tickets (
  id text PRIMARY KEY,
  market text NOT NULL,
  request_id text NOT NULL REFERENCES after_sales_requests(id),
  order_id text NOT NULL,
  data jsonb NOT NULL,
  UNIQUE (market, request_id)
);
CREATE TABLE IF NOT EXISTS after_sales_ticket_keys (
  market text NOT NULL,
  actor_id text NOT NULL,
  idempotency_key text NOT NULL,
  fingerprint text NOT NULL,
  ticket_id text NOT NULL REFERENCES after_sales_tickets(id),
  PRIMARY KEY (market, actor_id, idempotency_key)
);
COMMIT;
