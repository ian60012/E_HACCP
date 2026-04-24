-- Migration: Daily Batch Sheet (FSP-LOG-017)
-- Date: 2026-04-24
-- Idempotent: safe to re-run (uses IF NOT EXISTS).

-- 1. Batch sheet header (one per production batch)
CREATE TABLE IF NOT EXISTS prod_daily_batch_sheets (
    id          SERIAL PRIMARY KEY,
    batch_id    INTEGER NOT NULL UNIQUE REFERENCES prod_batches(id) ON DELETE CASCADE,
    operator_id INTEGER REFERENCES users(id),
    operator_name VARCHAR(100),
    verified_by INTEGER REFERENCES users(id),
    verified_at TIMESTAMPTZ,
    is_locked   BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_prod_daily_batch_sheets_batch_id
    ON prod_daily_batch_sheets(batch_id);

-- 2. Ingredient lines (many per sheet)
CREATE TABLE IF NOT EXISTS prod_batch_sheet_lines (
    id                  SERIAL PRIMARY KEY,
    sheet_id            INTEGER NOT NULL REFERENCES prod_daily_batch_sheets(id) ON DELETE CASCADE,
    inv_item_id         INTEGER REFERENCES inv_items(id) ON DELETE SET NULL,
    ingredient_name     VARCHAR(200) NOT NULL,
    receiving_log_id    INTEGER REFERENCES receiving_logs(id) ON DELETE SET NULL,
    is_used             BOOLEAN NOT NULL DEFAULT FALSE,
    supplier            VARCHAR(200),
    supplier_batch_no   VARCHAR(100),
    qty_used            NUMERIC(12,3),
    unit                VARCHAR(20),
    seq                 INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS ix_prod_batch_sheet_lines_sheet_id
    ON prod_batch_sheet_lines(sheet_id);
CREATE INDEX IF NOT EXISTS ix_prod_batch_sheet_lines_inv_item_id
    ON prod_batch_sheet_lines(inv_item_id);
