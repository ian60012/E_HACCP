-- Migration: add item_type enum to inv_items
-- Date: 2026-05-07
--
-- Replaces the free-text `category` field as the primary classifier of
-- inventory items. `category` is retained as a free-text sub-classification
-- (e.g. 肉類, 調味料, 蔬菜) for users to fill in later.
--
-- Backfill rules (covers categories observed on both local & NAS deployments):
--   '原料' / '原料肉'                                       -> 'raw'
--   '熱加工' / 'hot_process'
--     / 'Frozen' / 'Frozen Dumpling' / 'forming'             -> 'finished'
--   '包材'                                                   -> 'packaging'
-- Anything else (incl. NULL) defaults to 'raw' via column DEFAULT, then
-- the redundant Chinese/English category strings are nulled out so that
-- `category` only carries true sub-classification going forward.

BEGIN;

DO $$ BEGIN
    CREATE TYPE item_type_enum AS ENUM ('raw', 'intermediate', 'finished', 'packaging');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add column with NOT NULL DEFAULT 'raw' so old code can still INSERT rows
-- between migration application and new-code deployment.
ALTER TABLE inv_items
    ADD COLUMN IF NOT EXISTS item_type item_type_enum NOT NULL DEFAULT 'raw';

-- Ensure DEFAULT is set even on environments where the column was added
-- by an earlier version of this migration without it.
ALTER TABLE inv_items
    ALTER COLUMN item_type SET DEFAULT 'raw';

-- Backfill from existing category strings.
-- 'raw' is implicit via DEFAULT; only override for non-raw cases.
UPDATE inv_items SET item_type = 'finished'
    WHERE category IN ('熱加工', 'hot_process', 'Frozen', 'Frozen Dumpling', 'forming');

UPDATE inv_items SET item_type = 'packaging'
    WHERE category IN ('包材');

-- Drop redundant category strings now that item_type owns the main classification.
UPDATE inv_items SET category = NULL
    WHERE category IN (
        '原料', '原料肉',
        '熱加工', 'hot_process', 'Frozen', 'Frozen Dumpling', 'forming',
        '包材'
    );

CREATE INDEX IF NOT EXISTS idx_inv_items_item_type ON inv_items(item_type);

COMMENT ON COLUMN inv_items.item_type IS
    'Primary item classification: raw / intermediate / finished / packaging.';
COMMENT ON COLUMN inv_items.category IS
    'Free-text sub-classification (e.g. 肉類/調味料/蔬菜). Optional.';

COMMIT;
