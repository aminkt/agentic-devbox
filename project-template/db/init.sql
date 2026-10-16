-- Sample schema for the example project, plus a least-privilege role for AI agents.
-- The agent's Postgres MCP server connects as agent_ro (see .agentic-devbox/mcp-project.json),
-- so even a misbehaving tool call cannot change data: the database enforces read-only.

CREATE TABLE customers (
  id         serial PRIMARY KEY,
  name       text        NOT NULL,
  email      text        NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE orders (
  id          serial PRIMARY KEY,
  customer_id integer       NOT NULL REFERENCES customers (id),
  total_cents integer       NOT NULL CHECK (total_cents >= 0),
  status      text          NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'shipped')),
  created_at  timestamptz   NOT NULL DEFAULT now()
);

INSERT INTO customers (name, email) VALUES
  ('Ada Lovelace', 'ada@example.com'),
  ('Alan Turing', 'alan@example.com'),
  ('Grace Hopper', 'grace@example.com');

INSERT INTO orders (customer_id, total_cents, status) VALUES
  (1, 4200, 'paid'),
  (1, 1999, 'shipped'),
  (2, 12500, 'pending'),
  (3, 800, 'paid');

-- Read-only role for agents. The password is for local development only.
CREATE ROLE agent_ro LOGIN PASSWORD 'agent_ro';
GRANT CONNECT ON DATABASE app TO agent_ro;
GRANT USAGE ON SCHEMA public TO agent_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO agent_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO agent_ro;
ALTER ROLE agent_ro SET default_transaction_read_only = on;
