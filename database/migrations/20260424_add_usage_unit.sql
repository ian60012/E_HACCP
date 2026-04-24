-- Migration: add usage_unit to inv_items
-- Date: 2026-04-24
-- Separates the receiving/inventory unit (base_unit) from the
-- production usage unit used in Daily Batch Sheet (usage_unit).
-- usage_unit is nullable; NULL means fall back to base_unit.

ALTER TABLE inv_items
    ADD COLUMN IF NOT EXISTS usage_unit VARCHAR(20);

COMMENT ON COLUMN inv_items.usage_unit IS
    'Production recording unit for Daily Batch Sheet (e.g. KG, G, L). '
    'NULL = fall back to base_unit.';
