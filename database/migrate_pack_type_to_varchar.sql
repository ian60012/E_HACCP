-- Migration: Change pack_type columns from prod_pack_type_enum to VARCHAR(50)
-- This allows dynamic pack types managed via prod_pack_types config table
-- instead of hardcoded PostgreSQL enum values.

-- Step 1: Alter prod_packing_records.pack_type to VARCHAR(50)
ALTER TABLE prod_packing_records
  ALTER COLUMN pack_type TYPE VARCHAR(50) USING pack_type::text;

-- Step 2: Alter prod_repack_outputs.pack_type to VARCHAR(50)
ALTER TABLE prod_repack_outputs
  ALTER COLUMN pack_type TYPE VARCHAR(50) USING pack_type::text;

-- Note: The prod_pack_type_enum type is no longer used by any table
-- but we leave it in place to avoid errors. It can be dropped manually if desired:
-- DROP TYPE IF EXISTS prod_pack_type_enum;
