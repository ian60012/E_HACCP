-- Additive migration: existing and automatically generated documents remain general.
-- Create the enum first. Older databases never ran 20260507_add_item_type.sql.
DO $$ BEGIN
    CREATE TYPE item_type_enum AS ENUM ('raw', 'intermediate', 'finished', 'packaging');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
ALTER TYPE item_type_enum ADD VALUE IF NOT EXISTS 'raw';
ALTER TYPE item_type_enum ADD VALUE IF NOT EXISTS 'intermediate';
ALTER TYPE item_type_enum ADD VALUE IF NOT EXISTS 'finished';
ALTER TYPE item_type_enum ADD VALUE IF NOT EXISTS 'packaging';
ALTER TABLE inv_stock_docs ADD COLUMN IF NOT EXISTS item_type_scope item_type_enum;
CREATE INDEX IF NOT EXISTS ix_inv_stock_docs_item_type_scope ON inv_stock_docs(item_type_scope);
