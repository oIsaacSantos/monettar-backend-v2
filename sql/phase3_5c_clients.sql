-- FASE 3.5C: Clientes + cadastro manual

-- Soft delete support for clients
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Additional client fields for profile management
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS notes text;

-- Support queries that ignore soft-deleted clients
CREATE INDEX IF NOT EXISTS idx_clients_business_deleted_at
  ON clients (business_id)
  WHERE deleted_at IS NULL;

-- Support bulk client lookups by normalized phone value
CREATE INDEX IF NOT EXISTS idx_clients_business_phone
  ON clients (business_id, phone);
