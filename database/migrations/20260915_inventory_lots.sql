-- Dual-use meat products and opt-in inventory lot tracking (2026-09-15)
ALTER TABLE inv_items ADD COLUMN IF NOT EXISTS lot_tracking_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- statement
ALTER TABLE inv_items ADD COLUMN IF NOT EXISTS meat_output_type VARCHAR(20)
    CHECK (meat_output_type IN ('intermediate', 'finished'));

-- statement
ALTER TABLE receiving_logs ADD COLUMN IF NOT EXISTS supplier_batch_no VARCHAR(100);

-- statement
ALTER TABLE prod_batches ADD COLUMN IF NOT EXISTS input_stock_doc_id INTEGER
    REFERENCES inv_stock_docs(id) ON DELETE SET NULL;

-- statement
CREATE TABLE IF NOT EXISTS inv_lots (
    id                  SERIAL PRIMARY KEY,
    item_id             INTEGER NOT NULL REFERENCES inv_items(id) ON DELETE RESTRICT,
    lot_code            VARCHAR(100) NOT NULL,
    origin_type         VARCHAR(30) NOT NULL
                        CHECK (origin_type IN ('receiving', 'meat_processing', 'legacy', 'manual_adjustment')),
    is_system_generated BOOLEAN NOT NULL DEFAULT FALSE,
    supplier_id         INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
    receiving_log_id    INTEGER REFERENCES receiving_logs(id) ON DELETE RESTRICT,
    prod_batch_id       INTEGER REFERENCES prod_batches(id) ON DELETE RESTRICT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- statement
CREATE INDEX IF NOT EXISTS ix_inv_lots_item ON inv_lots(item_id);

-- statement
CREATE UNIQUE INDEX IF NOT EXISTS uq_inv_lots_receiving
    ON inv_lots(receiving_log_id) WHERE receiving_log_id IS NOT NULL;

-- statement
CREATE UNIQUE INDEX IF NOT EXISTS uq_inv_lots_meat_batch_item
    ON inv_lots(prod_batch_id, item_id) WHERE prod_batch_id IS NOT NULL;

-- statement
CREATE UNIQUE INDEX IF NOT EXISTS uq_inv_lots_legacy_item
    ON inv_lots(item_id) WHERE origin_type = 'legacy';

-- statement
ALTER TABLE inv_stock_lines ADD COLUMN IF NOT EXISTS lot_id INTEGER
    REFERENCES inv_lots(id) ON DELETE RESTRICT;

-- statement
ALTER TABLE inv_stock_movements ADD COLUMN IF NOT EXISTS lot_id INTEGER
    REFERENCES inv_lots(id) ON DELETE RESTRICT;

-- statement
ALTER TABLE inv_stocktake_lines ADD COLUMN IF NOT EXISTS lot_id INTEGER
    REFERENCES inv_lots(id) ON DELETE RESTRICT;

-- statement
ALTER TABLE prod_meat_inputs ADD COLUMN IF NOT EXISTS source_location_id INTEGER
    REFERENCES inv_locations(id) ON DELETE RESTRICT;

-- statement
ALTER TABLE prod_meat_inputs ADD COLUMN IF NOT EXISTS source_lot_id INTEGER
    REFERENCES inv_lots(id) ON DELETE RESTRICT;

-- statement
ALTER TABLE prod_meat_inputs ADD COLUMN IF NOT EXISTS source_location_name VARCHAR(200);

-- statement
ALTER TABLE prod_meat_inputs ADD COLUMN IF NOT EXISTS source_lot_code VARCHAR(100);

-- statement
ALTER TABLE inv_stock_balance ADD COLUMN IF NOT EXISTS id BIGSERIAL;

-- statement
ALTER TABLE inv_stock_balance ADD COLUMN IF NOT EXISTS lot_id INTEGER
    REFERENCES inv_lots(id) ON DELETE RESTRICT;

-- statement
DO $$
DECLARE definition TEXT;
BEGIN
    SELECT pg_get_constraintdef(oid) INTO definition
    FROM pg_constraint
    WHERE conrelid = 'inv_stock_balance'::regclass AND contype = 'p';
    IF definition IS NULL OR definition NOT LIKE '%(id)%' THEN
        IF definition IS NOT NULL THEN
            ALTER TABLE inv_stock_balance DROP CONSTRAINT inv_stock_balance_pkey;
        END IF;
        ALTER TABLE inv_stock_balance ADD CONSTRAINT inv_stock_balance_pkey PRIMARY KEY (id);
    END IF;
END $$;

-- statement
CREATE UNIQUE INDEX IF NOT EXISTS uq_inv_stock_balance_untracked
    ON inv_stock_balance(item_id, location_id) WHERE lot_id IS NULL;

-- statement
CREATE UNIQUE INDEX IF NOT EXISTS uq_inv_stock_balance_lot
    ON inv_stock_balance(item_id, location_id, lot_id) WHERE lot_id IS NOT NULL;

-- statement
CREATE INDEX IF NOT EXISTS ix_inv_stock_lines_lot ON inv_stock_lines(lot_id);

-- statement
CREATE INDEX IF NOT EXISTS ix_inv_stock_movements_lot ON inv_stock_movements(lot_id);

-- statement
CREATE INDEX IF NOT EXISTS ix_inv_stocktake_lines_lot ON inv_stocktake_lines(lot_id);

-- statement
CREATE OR REPLACE FUNCTION guard_inventory_lot_source() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' AND (EXISTS (SELECT 1 FROM inv_stock_movements WHERE lot_id = OLD.id)
        OR EXISTS (SELECT 1 FROM inv_stock_balance WHERE lot_id = OLD.id)) THEN
        RAISE EXCEPTION 'Inventory lot with stock history cannot be deleted';
    END IF;
    IF TG_OP = 'UPDATE' AND EXISTS (SELECT 1 FROM inv_stock_movements WHERE lot_id = OLD.id)
       AND (NEW.item_id, NEW.lot_code, NEW.origin_type, NEW.supplier_id, NEW.receiving_log_id, NEW.prod_batch_id)
           IS DISTINCT FROM
           (OLD.item_id, OLD.lot_code, OLD.origin_type, OLD.supplier_id, OLD.receiving_log_id, OLD.prod_batch_id) THEN
        RAISE EXCEPTION 'Inventory lot source is immutable after movement';
    END IF;
    RETURN COALESCE(NEW, OLD);
END $$;

-- statement
DROP TRIGGER IF EXISTS protect_inventory_lot_source ON inv_lots;

-- statement
CREATE TRIGGER protect_inventory_lot_source
    BEFORE UPDATE OR DELETE ON inv_lots
    FOR EACH ROW EXECUTE FUNCTION guard_inventory_lot_source();

-- statement
CREATE OR REPLACE FUNCTION prevent_locked_modification()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.is_locked = TRUE THEN
        IF NEW.is_voided = TRUE AND OLD.is_voided = FALSE THEN
            RETURN NEW;
        END IF;
        -- A locked receiving inspection stays immutable, but the later inventory
        -- conversion is allowed to attach its stock document exactly once.
        IF TG_TABLE_NAME = 'receiving_logs'
           AND to_jsonb(OLD)->'inv_stock_doc_id' = 'null'::jsonb
           AND to_jsonb(NEW)->'inv_stock_doc_id' <> 'null'::jsonb
           AND (to_jsonb(NEW) - 'inv_stock_doc_id') = (to_jsonb(OLD) - 'inv_stock_doc_id') THEN
            RETURN NEW;
        END IF;
        RAISE EXCEPTION 'Cannot modify locked record (id=%) in "%" table. Record has been QA-verified. Void and re-enter if correction is needed.', OLD.id, TG_TABLE_NAME;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
