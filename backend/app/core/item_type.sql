-- Idempotent item_type_enum upgrade for databases created before 2026-05-07.
-- Safe to re-run. Does not drop types, columns, triggers, or rows.
-- Category text is left unchanged. Existing item_type values are not rewritten.
--
-- Apply with psql autocommit (do not wrap this file in one BEGIN/COMMIT).
-- A label added by ALTER TYPE cannot be used until that statement commits.
-- Startup runs each enum statement in its own transaction for the same reason.
DO $$ BEGIN
    CREATE TYPE item_type_enum AS ENUM ('raw', 'intermediate', 'finished', 'packaging');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
-- statement
ALTER TYPE item_type_enum ADD VALUE IF NOT EXISTS 'raw';
-- statement
ALTER TYPE item_type_enum ADD VALUE IF NOT EXISTS 'intermediate';
-- statement
ALTER TYPE item_type_enum ADD VALUE IF NOT EXISTS 'finished';
-- statement
ALTER TYPE item_type_enum ADD VALUE IF NOT EXISTS 'packaging';
-- statement
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'inv_items'
          AND column_name = 'item_type'
    ) THEN
        ALTER TABLE inv_items
            ADD COLUMN item_type item_type_enum NOT NULL DEFAULT 'raw';
        -- One-time classification of the new column. Same category rules as
        -- database/migrations/20260507_add_item_type.sql. Anything else stays raw.
        UPDATE inv_items SET item_type = 'finished'
            WHERE category IN ('熱加工', 'hot_process', 'Frozen', 'Frozen Dumpling', 'forming');
        UPDATE inv_items SET item_type = 'packaging'
            WHERE category IN ('包材');
    END IF;
END $$;
-- statement
ALTER TABLE inv_items ALTER COLUMN item_type SET DEFAULT 'raw';
-- statement
CREATE INDEX IF NOT EXISTS idx_inv_items_item_type ON inv_items(item_type);
-- statement
ALTER TABLE inv_stock_docs ADD COLUMN IF NOT EXISTS item_type_scope item_type_enum;
-- statement
CREATE INDEX IF NOT EXISTS ix_inv_stock_docs_item_type_scope ON inv_stock_docs(item_type_scope);
