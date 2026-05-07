-- Migration: add prod_product_pack_config table
-- Date: 2026-05-07
--
-- Stores the (product × pack_type) → inv_item mapping so that packing
-- records can have their inv_item_id auto-populated from this config,
-- and enter_batch_to_inventory() can resolve missing inv_item_ids without
-- requiring per-record manual selection.

BEGIN;

CREATE TABLE IF NOT EXISTS prod_product_pack_config (
    id              SERIAL PRIMARY KEY,
    product_id      INTEGER NOT NULL REFERENCES prod_products(id) ON DELETE CASCADE,
    pack_type_code  VARCHAR(30) NOT NULL,
    inv_item_id     INTEGER REFERENCES inv_items(id) ON DELETE SET NULL,
    UNIQUE (product_id, pack_type_code)
);

CREATE INDEX IF NOT EXISTS idx_prod_pack_config_product
    ON prod_product_pack_config(product_id);

COMMIT;
