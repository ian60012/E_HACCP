-- Batch sensory quality inspection, retained samples, photo metadata, and role permissions.
-- Keep synchronized with backend/app/core/quality_control.sql.

CREATE TABLE IF NOT EXISTS quality_control_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    enforcement_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO quality_control_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS quality_role_permissions (
    role VARCHAR(30) PRIMARY KEY,
    can_view BOOLEAN NOT NULL DEFAULT FALSE,
    can_edit BOOLEAN NOT NULL DEFAULT FALSE,
    can_verify BOOLEAN NOT NULL DEFAULT FALSE,
    updated_by INTEGER REFERENCES users(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_quality_role_permission_dependency
        CHECK (can_view OR (NOT can_edit AND NOT can_verify))
);
INSERT INTO quality_role_permissions (role, can_view, can_edit, can_verify) VALUES
    ('Admin', TRUE, TRUE, TRUE),
    ('QA', TRUE, TRUE, TRUE),
    ('Production', TRUE, TRUE, FALSE),
    ('Warehouse', TRUE, FALSE, FALSE),
    ('Captain', TRUE, TRUE, TRUE)
ON CONFLICT (role) DO NOTHING;

CREATE TABLE IF NOT EXISTS prod_batch_quality_inspections (
    id SERIAL PRIMARY KEY,
    batch_id INTEGER NOT NULL REFERENCES prod_batches(id) ON DELETE CASCADE,
    revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
    status VARCHAR(20) NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'approved', 'rejected')),
    inspection_at TIMESTAMPTZ,
    color_result VARCHAR(20) CHECK (color_result IS NULL OR color_result IN ('pass', 'fail', 'not_applicable')),
    aroma_result VARCHAR(20) CHECK (aroma_result IS NULL OR aroma_result IN ('pass', 'fail', 'not_applicable')),
    taste_result VARCHAR(20) CHECK (taste_result IS NULL OR taste_result IN ('pass', 'fail', 'not_applicable')),
    not_applicable_reason TEXT,
    notes TEXT,
    corrective_action TEXT,
    retained_sample BOOLEAN,
    no_sample_reason TEXT,
    sample_code VARCHAR(100),
    sample_quantity NUMERIC(12,3) CHECK (sample_quantity IS NULL OR sample_quantity > 0),
    sample_unit VARCHAR(30),
    sampled_at TIMESTAMPTZ,
    storage_condition VARCHAR(20)
        CHECK (storage_condition IS NULL OR storage_condition IN ('ambient', 'chilled', 'frozen', 'other')),
    storage_location VARCHAR(200),
    disposal_due_date DATE,
    photo_stored_name VARCHAR(255),
    photo_original_name VARCHAR(255),
    photo_content_type VARCHAR(100),
    photo_size_bytes INTEGER CHECK (photo_size_bytes IS NULL OR photo_size_bytes > 0),
    photo_uploaded_by INTEGER REFERENCES users(id),
    photo_uploaded_at TIMESTAMPTZ,
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by INTEGER NOT NULL REFERENCES users(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    verified_by INTEGER REFERENCES users(id),
    verified_at TIMESTAMPTZ,
    verifier_signature_data_url TEXT,
    CONSTRAINT uq_prod_batch_quality_revision UNIQUE (batch_id, revision)
);
CREATE INDEX IF NOT EXISTS ix_prod_batch_quality_batch_id ON prod_batch_quality_inspections(batch_id);
CREATE INDEX IF NOT EXISTS ix_prod_batch_quality_status ON prod_batch_quality_inspections(status);

CREATE OR REPLACE FUNCTION prevent_quality_inspection_delete()
RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'Quality inspection records cannot be deleted; create a new revision instead';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_prevent_quality_inspection_delete ON prod_batch_quality_inspections;
CREATE TRIGGER trg_prevent_quality_inspection_delete
    BEFORE DELETE ON prod_batch_quality_inspections
    FOR EACH ROW EXECUTE FUNCTION prevent_quality_inspection_delete();

CREATE OR REPLACE FUNCTION protect_verified_quality_inspection()
RETURNS trigger AS $$
BEGIN
    IF OLD.status IN ('approved', 'rejected') AND NEW IS DISTINCT FROM OLD THEN
        RAISE EXCEPTION 'Verified quality inspection records are locked';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_protect_verified_quality_inspection ON prod_batch_quality_inspections;
CREATE TRIGGER trg_protect_verified_quality_inspection
    BEFORE UPDATE ON prod_batch_quality_inspections
    FOR EACH ROW EXECUTE FUNCTION protect_verified_quality_inspection();
