ALTER TYPE prod_product_type_enum ADD VALUE IF NOT EXISTS 'meat_processing';
-- statement
ALTER TYPE prod_batch_status_enum ADD VALUE IF NOT EXISTS 'packed';
-- statement
ALTER TABLE prod_batches ADD COLUMN IF NOT EXISTS process_type VARCHAR(30)
    CHECK (process_type IN ('forming', 'hot_process', 'meat_processing'));
-- statement
UPDATE prod_batches b SET process_type = p.product_type::text
FROM prod_products p WHERE b.process_type IS NULL AND b.product_code = p.code;
-- statement
CREATE OR REPLACE VIEW prod_batch_type_migration_review AS
SELECT id, batch_code, product_code FROM prod_batches WHERE process_type IS NULL;
-- statement
CREATE TABLE IF NOT EXISTS prod_meat_records (
    id SERIAL PRIMARY KEY,
    batch_id INTEGER NOT NULL REFERENCES prod_batches(id),
    version INTEGER NOT NULL CHECK (version > 0),
    state VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','submitted','verified','stocked')),
    difference_reason TEXT NOT NULL DEFAULT '',
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_by INTEGER REFERENCES users(id), completed_at TIMESTAMPTZ,
    operator_signature_data_url TEXT,
    verified_by INTEGER REFERENCES users(id), verified_at TIMESTAMPTZ,
    verifier_signature_data_url TEXT,
    UNIQUE(batch_id, version),
    CHECK (state = 'draft' OR (completed_by IS NOT NULL AND completed_at IS NOT NULL AND operator_signature_data_url IS NOT NULL)),
    CHECK (state IN ('draft','submitted') OR (verified_by IS NOT NULL AND verified_at IS NOT NULL AND verifier_signature_data_url IS NOT NULL))
);
-- statement
CREATE TABLE IF NOT EXISTS prod_meat_inputs (
    id SERIAL PRIMARY KEY, record_id INTEGER NOT NULL REFERENCES prod_meat_records(id),
    inv_item_id INTEGER NOT NULL REFERENCES inv_items(id), item_name VARCHAR(200) NOT NULL,
    supplier VARCHAR(200) NOT NULL, source_batch VARCHAR(100) NOT NULL,
    receiving_log_id INTEGER REFERENCES receiving_logs(id),
    weight_kg NUMERIC(12,3) NOT NULL CHECK (weight_kg > 0)
);
-- statement
CREATE TABLE IF NOT EXISTS prod_meat_steps (
    id SERIAL PRIMARY KEY, record_id INTEGER NOT NULL REFERENCES prod_meat_records(id),
    seq INTEGER NOT NULL CHECK (seq > 0),
    kind VARCHAR(30) NOT NULL CHECK (kind IN ('thaw','trim','slice','dice','mince','marinate')),
    start_time TIMESTAMPTZ, end_time TIMESTAMPTZ, operator VARCHAR(100) NOT NULL,
    temperature_c NUMERIC(5,2), measured_at TIMESTAMPTZ, notes TEXT NOT NULL DEFAULT '',
    UNIQUE(record_id, seq),
    CHECK (end_time IS NULL OR (start_time IS NOT NULL AND end_time >= start_time)),
    CHECK ((temperature_c IS NULL) = (measured_at IS NULL))
);
-- statement
CREATE TABLE IF NOT EXISTS prod_meat_outputs (
    id SERIAL PRIMARY KEY, record_id INTEGER NOT NULL REFERENCES prod_meat_records(id),
    inv_item_id INTEGER NOT NULL REFERENCES inv_items(id), item_name VARCHAR(200) NOT NULL,
    weight_kg NUMERIC(12,3) NOT NULL CHECK (weight_kg > 0),
    pack_count INTEGER CHECK (pack_count > 0), pack_type VARCHAR(50),
    location_id INTEGER NOT NULL REFERENCES inv_locations(id), location_name VARCHAR(200) NOT NULL
);
-- statement
CREATE TABLE IF NOT EXISTS prod_meat_losses (
    id SERIAL PRIMARY KEY, record_id INTEGER NOT NULL REFERENCES prod_meat_records(id),
    kind VARCHAR(100) NOT NULL, weight_kg NUMERIC(12,3) NOT NULL CHECK (weight_kg > 0),
    notes TEXT NOT NULL DEFAULT ''
);
-- statement
CREATE OR REPLACE FUNCTION guard_meat_revision() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE batch_row prod_batches; prior_state TEXT;
BEGIN
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Meat records cannot be deleted'; END IF;
    SELECT * INTO batch_row FROM prod_batches WHERE id = NEW.batch_id FOR UPDATE;
    IF batch_row.is_voided THEN RAISE EXCEPTION 'Voided meat batch is immutable'; END IF;
    IF TG_OP = 'INSERT' THEN
        SELECT state INTO prior_state FROM prod_meat_records WHERE batch_id = NEW.batch_id ORDER BY version DESC LIMIT 1;
        IF prior_state IN ('verified','stocked') OR batch_row.inv_stock_doc_id IS NOT NULL THEN
            RAISE EXCEPTION 'Verified meat batch is immutable';
        END IF;
    ELSE
        IF (to_jsonb(NEW) - ARRAY['state','completed_by','completed_at','operator_signature_data_url','verified_by','verified_at','verifier_signature_data_url'])
           IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['state','completed_by','completed_at','operator_signature_data_url','verified_by','verified_at','verifier_signature_data_url']) THEN
            RAISE EXCEPTION 'Save a new meat revision';
        END IF;
        IF OLD.state = 'stocked' OR (OLD.state = 'verified' AND
            ((to_jsonb(NEW) - 'state') IS DISTINCT FROM (to_jsonb(OLD) - 'state') OR NEW.state <> 'stocked')) THEN
            RAISE EXCEPTION 'Verified meat record is immutable';
        END IF;
        IF NOT ((OLD.state = 'draft' AND NEW.state = 'submitted') OR
                (OLD.state = 'submitted' AND NEW.state = 'verified') OR
                (OLD.state = 'verified' AND NEW.state = 'stocked')) THEN
            RAISE EXCEPTION 'Invalid meat state transition';
        END IF;
    END IF;
    RETURN NEW;
END $$;
-- statement
CREATE OR REPLACE FUNCTION guard_meat_detail() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_state TEXT; parent_batch INTEGER;
BEGIN
    IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Meat detail revisions are append-only'; END IF;
    SELECT state, batch_id INTO parent_state, parent_batch FROM prod_meat_records WHERE id = NEW.record_id;
    PERFORM 1 FROM prod_batches WHERE id = parent_batch AND NOT is_voided FOR UPDATE;
    IF NOT FOUND OR parent_state <> 'draft' THEN RAISE EXCEPTION 'Meat detail is locked'; END IF;
    RETURN NEW;
END $$;
-- statement
CREATE OR REPLACE FUNCTION guard_meat_batch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.process_type IS NOT NULL AND NEW.process_type IS DISTINCT FROM OLD.process_type THEN
        RAISE EXCEPTION 'Batch process type snapshot is immutable';
    END IF;
    IF OLD.process_type = 'meat_processing' AND (OLD.is_voided OR EXISTS (
        SELECT 1 FROM prod_meat_records WHERE batch_id = OLD.id AND state IN ('verified','stocked')
    )) AND (to_jsonb(NEW) - ARRAY['status','inv_stock_doc_id','input_stock_doc_id','is_voided','void_reason','voided_at','voided_by'])
         IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','inv_stock_doc_id','input_stock_doc_id','is_voided','void_reason','voided_at','voided_by']) THEN
        RAISE EXCEPTION 'Verified meat batch is immutable';
    END IF;
    RETURN NEW;
END $$;
-- statement
DO $$ DECLARE tbl TEXT; BEGIN
    DROP TRIGGER IF EXISTS protect_meat_revision ON prod_meat_records;
    CREATE TRIGGER protect_meat_revision BEFORE INSERT OR UPDATE OR DELETE ON prod_meat_records FOR EACH ROW EXECUTE FUNCTION guard_meat_revision();
    DROP TRIGGER IF EXISTS protect_meat_batch ON prod_batches;
    CREATE TRIGGER protect_meat_batch BEFORE UPDATE ON prod_batches FOR EACH ROW EXECUTE FUNCTION guard_meat_batch();
    FOREACH tbl IN ARRAY ARRAY['prod_meat_inputs','prod_meat_steps','prod_meat_outputs','prod_meat_losses'] LOOP
        EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I(record_id)', tbl || '_record_idx', tbl);
        EXECUTE format('DROP TRIGGER IF EXISTS protect_meat_detail ON %I', tbl);
        EXECUTE format('CREATE TRIGGER protect_meat_detail BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION guard_meat_detail()', tbl);
    END LOOP;
END $$;
