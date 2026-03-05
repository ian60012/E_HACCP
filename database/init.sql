-- ============================================================================
-- FD Catering Service Pty Ltd - HACCP eQMS Database Schema
-- Version: 2.0.0
-- Date: 2026-02-19
--
-- References:
--   FSP-LOG-001  Receiving Log
--   FSP-LOG-004  Cooking CCP Log
--   FSP-LOG-005  Cooling CCP Log
--   FSP-LOG-CLN-001  Sanitising & Cleaning Log
--   FSP-LOG-ASM-001  Assembly & Packing Log
--   FSP-CAPA-LOG-001  Deviation & CAPA Log
--
-- ALCOA+ Compliance:
--   All log tables enforce: Attributable, Legible, Contemporaneous,
--   Original, Accurate. No hard deletes (trigger-enforced). QA lock
--   mechanism prevents post-review modification (trigger-enforced).
--
-- IMPORTANT: This script runs ONLY on first database initialization
-- (empty PostgreSQL data volume). To re-run:
--   docker-compose down -v && docker-compose up -d
-- ============================================================================

-- ============================================================================
-- SECTION 1: ENUM TYPE DEFINITIONS
-- ============================================================================

DO $$ BEGIN
    CREATE TYPE user_role_enum AS ENUM ('Operator', 'QA', 'Manager');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE pass_fail_enum AS ENUM ('Pass', 'Fail');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE acceptance_enum AS ENUM ('Accept', 'Reject', 'Hold');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE ccp_status_enum AS ENUM ('Pass', 'Fail', 'Deviation');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE severity_enum AS ENUM ('Critical', 'Major', 'Minor');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE immediate_action_enum AS ENUM ('Quarantine', 'Hold', 'Discard', 'Rework', 'Other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE chemical_enum AS ENUM ('Buff', 'Hybrid', 'Command', 'Keyts', 'Chlorine');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE log_type_enum AS ENUM ('receiving', 'cooking', 'cooling', 'sanitising', 'assembly');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================================
-- SECTION 2: REFERENCE / SUPPORTING TABLES
-- ============================================================================

-- Users: operators, QA staff, and managers
CREATE TABLE IF NOT EXISTS users (
    id              SERIAL PRIMARY KEY,
    username        VARCHAR(50)     NOT NULL UNIQUE,
    password_hash   VARCHAR(255)    NOT NULL,
    full_name       VARCHAR(100)    NOT NULL DEFAULT '',
    email           VARCHAR(255),
    role            user_role_enum  NOT NULL DEFAULT 'Operator',
    is_active       BOOLEAN         NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- Suppliers: referenced by receiving_logs
CREATE TABLE IF NOT EXISTS suppliers (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(200)    NOT NULL UNIQUE,
    contact_name    VARCHAR(100),
    phone           VARCHAR(50),
    email           VARCHAR(255),
    address         TEXT,
    is_active       BOOLEAN         NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- Equipment: cooking equipment referenced by cooking_logs
CREATE TABLE IF NOT EXISTS equipment (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(100)    NOT NULL UNIQUE,
    equipment_type  VARCHAR(50),
    location        VARCHAR(100),
    is_active       BOOLEAN         NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- Areas: physical zones referenced by sanitising_logs
CREATE TABLE IF NOT EXISTS areas (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(100)    NOT NULL UNIQUE,
    description     TEXT,
    is_active       BOOLEAN         NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- Products: food products with configurable CCP temperature limits
CREATE TABLE IF NOT EXISTS products (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(200)    NOT NULL,
    ccp_limit_temp  NUMERIC(5,2)    NOT NULL DEFAULT 75.00,
    is_active       BOOLEAN         NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);


-- ============================================================================
-- SECTION 3: CORE HACCP LOG TABLES (ALCOA+ Compliant)
--
-- Every log table includes these common audit fields:
--   operator_id   - WHO recorded the entry (Attributable)
--   created_at    - WHEN it was recorded (Contemporaneous, auto-stamped)
--   verified_by   - WHO reviewed it (QA verification)
--   is_locked     - Locked after QA review (no further edits)
--   is_voided     - Soft delete (never hard delete)
--   void_reason   - Reason for voiding
--   voided_at     - When voided
--   voided_by     - Who voided
-- ============================================================================

-- -------------------------------------------------
-- Table 1: Receiving Log (FSP-LOG-001)
-- -------------------------------------------------
CREATE TABLE IF NOT EXISTS receiving_logs (
    id                      SERIAL PRIMARY KEY,

    -- Business fields
    supplier_id             INT             NOT NULL REFERENCES suppliers(id),
    po_number               VARCHAR(50),
    product_name            VARCHAR(200)    NOT NULL,
    temp_chilled            NUMERIC(5,2),
    temp_frozen             NUMERIC(5,2),
    vehicle_cleanliness     pass_fail_enum  NOT NULL,
    packaging_integrity     pass_fail_enum  NOT NULL,
    acceptance_status       acceptance_enum NOT NULL DEFAULT 'Accept',
    corrective_action       TEXT,
    notes                   TEXT,

    -- ALCOA+ audit fields
    operator_id             INT             NOT NULL REFERENCES users(id),
    verified_by             INT             REFERENCES users(id),
    is_locked               BOOLEAN         NOT NULL DEFAULT FALSE,
    is_voided               BOOLEAN         NOT NULL DEFAULT FALSE,
    void_reason             TEXT,
    voided_at               TIMESTAMPTZ,
    voided_by               INT             REFERENCES users(id),
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    -- CHECK constraints
    CONSTRAINT chk_receiving_chilled_range
        CHECK (temp_chilled IS NULL OR (temp_chilled >= -50.0 AND temp_chilled <= 50.0)),
    CONSTRAINT chk_receiving_frozen_range
        CHECK (temp_frozen IS NULL OR (temp_frozen >= -80.0 AND temp_frozen <= 0.0)),
    CONSTRAINT chk_receiving_corrective_action
        CHECK (acceptance_status = 'Accept' OR corrective_action IS NOT NULL)
);

COMMENT ON TABLE receiving_logs IS 'FSP-LOG-001: Incoming goods receiving inspection. Temp violations (chilled >5°C or frozen >-18°C) trigger corrective action requirement.';


-- -------------------------------------------------
-- Table 2: Cooking CCP Log (FSP-LOG-004)
-- -------------------------------------------------
CREATE TABLE IF NOT EXISTS cooking_logs (
    id                      SERIAL PRIMARY KEY,

    -- Business fields
    batch_id                VARCHAR(50)     NOT NULL,
    product_id              INT             NOT NULL REFERENCES products(id),
    equipment_id            INT             REFERENCES equipment(id),
    start_time              TIMESTAMPTZ     NOT NULL,
    end_time                TIMESTAMPTZ,
    core_temp               NUMERIC(5,2),
    ccp_status              ccp_status_enum,
    corrective_action       TEXT,
    notes                   TEXT,

    -- ALCOA+ audit fields
    operator_id             INT             NOT NULL REFERENCES users(id),
    verified_by             INT             REFERENCES users(id),
    is_locked               BOOLEAN         NOT NULL DEFAULT FALSE,
    is_voided               BOOLEAN         NOT NULL DEFAULT FALSE,
    void_reason             TEXT,
    voided_at               TIMESTAMPTZ,
    voided_by               INT             REFERENCES users(id),
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    -- CHECK constraints
    CONSTRAINT chk_cooking_temp_range
        CHECK (core_temp IS NULL OR (core_temp >= 0.0 AND core_temp <= 250.0)),
    CONSTRAINT chk_cooking_time_order
        CHECK (end_time IS NULL OR end_time > start_time),
    CONSTRAINT chk_cooking_corrective_action
        CHECK (ccp_status IS NULL OR ccp_status = 'Pass' OR corrective_action IS NOT NULL)
);

COMMENT ON TABLE cooking_logs IS 'FSP-LOG-004: Cooking CCP log. CCP rule: core_temp >= product.ccp_limit_temp (default 75°C). Failure triggers deviation workflow.';


-- -------------------------------------------------
-- Table 3: Cooling CCP Log (FSP-LOG-005)
-- Most complex table with generated duration columns.
--
-- CCP Rules (enforced in backend, not DB constraints):
--   Stage 1: 60°C -> 21°C within 2 hours (120 min)
--   Total:   60°C -> <5°C  within 6 hours (360 min)
-- -------------------------------------------------
CREATE TABLE IF NOT EXISTS cooling_logs (
    id                      SERIAL PRIMARY KEY,

    -- Business fields
    batch_id                VARCHAR(50)     NOT NULL,
    start_time              TIMESTAMPTZ     NOT NULL,
    start_temp              NUMERIC(5,2)    NOT NULL,
    stage1_time             TIMESTAMPTZ,
    stage1_temp             NUMERIC(5,2),
    end_time                TIMESTAMPTZ,
    end_temp                NUMERIC(5,2),
    goes_to_freezer         BOOLEAN         NOT NULL DEFAULT FALSE,

    -- Generated duration columns (auto-calculated, STORED on disk)
    stage1_duration_minutes NUMERIC(8,2)    GENERATED ALWAYS AS (
        CASE
            WHEN stage1_time IS NOT NULL AND start_time IS NOT NULL
            THEN EXTRACT(EPOCH FROM (stage1_time - start_time)) / 60.0
            ELSE NULL
        END
    ) STORED,
    total_duration_minutes  NUMERIC(8,2)    GENERATED ALWAYS AS (
        CASE
            WHEN end_time IS NOT NULL AND start_time IS NOT NULL
            THEN EXTRACT(EPOCH FROM (end_time - start_time)) / 60.0
            ELSE NULL
        END
    ) STORED,

    ccp_status              ccp_status_enum,
    corrective_action       TEXT,
    notes                   TEXT,

    -- ALCOA+ audit fields
    operator_id             INT             NOT NULL REFERENCES users(id),
    verified_by             INT             REFERENCES users(id),
    is_locked               BOOLEAN         NOT NULL DEFAULT FALSE,
    is_voided               BOOLEAN         NOT NULL DEFAULT FALSE,
    void_reason             TEXT,
    voided_at               TIMESTAMPTZ,
    voided_by               INT             REFERENCES users(id),
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    -- CHECK constraints
    CONSTRAINT chk_cooling_start_temp_range
        CHECK (start_temp >= 0.0 AND start_temp <= 120.0),
    CONSTRAINT chk_cooling_stage1_temp_range
        CHECK (stage1_temp IS NULL OR (stage1_temp >= -10.0 AND stage1_temp <= 120.0)),
    CONSTRAINT chk_cooling_end_temp_range
        CHECK (end_temp IS NULL OR (end_temp >= -10.0 AND end_temp <= 120.0)),
    CONSTRAINT chk_cooling_stage1_time_order
        CHECK (stage1_time IS NULL OR stage1_time > start_time),
    CONSTRAINT chk_cooling_end_time_order
        CHECK (end_time IS NULL OR end_time > start_time),
    CONSTRAINT chk_cooling_corrective_action
        CHECK (ccp_status IS NULL OR ccp_status = 'Pass' OR corrective_action IS NOT NULL)
);

COMMENT ON TABLE cooling_logs IS 'FSP-LOG-005: Cooling CCP log. Stage 1: 60°C→21°C ≤2hr. If goes_to_freezer=TRUE, Stage 1 pass is sufficient (no end data required). Total: 60°C→<5°C ≤6hr for non-freezer products. Duration columns are auto-computed.';


-- -------------------------------------------------
-- Table 4: Sanitising & Cleaning Log (FSP-LOG-CLN-001)
-- -------------------------------------------------
CREATE TABLE IF NOT EXISTS sanitising_logs (
    id                      SERIAL PRIMARY KEY,

    -- Business fields
    area_id                 INT             NOT NULL REFERENCES areas(id),
    target_description      TEXT            NOT NULL,
    chemical                chemical_enum   NOT NULL,
    dilution_ratio          VARCHAR(20),
    atp_result_rlu          INT,
    atp_status              pass_fail_enum,
    corrective_action       TEXT,
    notes                   TEXT,

    -- ALCOA+ audit fields
    operator_id             INT             NOT NULL REFERENCES users(id),
    verified_by             INT             REFERENCES users(id),
    is_locked               BOOLEAN         NOT NULL DEFAULT FALSE,
    is_voided               BOOLEAN         NOT NULL DEFAULT FALSE,
    void_reason             TEXT,
    voided_at               TIMESTAMPTZ,
    voided_by               INT             REFERENCES users(id),
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    -- CHECK constraints
    CONSTRAINT chk_sanitising_atp_range
        CHECK (atp_result_rlu IS NULL OR atp_result_rlu >= 0),
    CONSTRAINT chk_sanitising_atp_consistency
        CHECK (
            (atp_result_rlu IS NULL AND atp_status IS NULL)
            OR (atp_result_rlu IS NOT NULL AND atp_status IS NOT NULL)
        ),
    CONSTRAINT chk_sanitising_corrective_action
        CHECK (atp_status IS NULL OR atp_status = 'Pass' OR corrective_action IS NOT NULL)
);

COMMENT ON TABLE sanitising_logs IS 'FSP-LOG-CLN-001: Cleaning & sanitising log. Chemicals: Buff/Hybrid/Command/Keyts/Chlorine. ATP Fail threshold for RTE contact surfaces: >100 RLU.';


-- -------------------------------------------------
-- Table 5: Assembly & Packing Log (FSP-LOG-ASM-001)
-- -------------------------------------------------
CREATE TABLE IF NOT EXISTS assembly_packing_logs (
    id                      SERIAL PRIMARY KEY,

    -- Business fields
    batch_id                VARCHAR(50)     NOT NULL,
    product_id              INT             NOT NULL REFERENCES products(id),

    -- Label verification
    is_allergen_declared    BOOLEAN         NOT NULL,
    is_date_code_correct    BOOLEAN,
    label_photo_path        VARCHAR(500),

    -- Weight check (5 samples)
    target_weight_g         NUMERIC(8,2),
    sample_1_g              NUMERIC(8,2),
    sample_2_g              NUMERIC(8,2),
    sample_3_g              NUMERIC(8,2),
    sample_4_g              NUMERIC(8,2),
    sample_5_g              NUMERIC(8,2),

    -- Generated average weight (auto-calculated when all 5 samples present)
    average_weight_g        NUMERIC(8,2)    GENERATED ALWAYS AS (
        CASE
            WHEN sample_1_g IS NOT NULL
                 AND sample_2_g IS NOT NULL
                 AND sample_3_g IS NOT NULL
                 AND sample_4_g IS NOT NULL
                 AND sample_5_g IS NOT NULL
            THEN (sample_1_g + sample_2_g + sample_3_g + sample_4_g + sample_5_g) / 5.0
            ELSE NULL
        END
    ) STORED,

    -- Packaging integrity
    seal_integrity          pass_fail_enum,
    coding_legibility       pass_fail_enum,
    corrective_action       TEXT,
    notes                   TEXT,

    -- ALCOA+ audit fields
    operator_id             INT             NOT NULL REFERENCES users(id),
    verified_by             INT             REFERENCES users(id),
    is_locked               BOOLEAN         NOT NULL DEFAULT FALSE,
    is_voided               BOOLEAN         NOT NULL DEFAULT FALSE,
    void_reason             TEXT,
    voided_at               TIMESTAMPTZ,
    voided_by               INT             REFERENCES users(id),
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    -- CHECK constraints
    CONSTRAINT chk_assembly_weights_positive
        CHECK (
            (sample_1_g IS NULL OR sample_1_g > 0)
            AND (sample_2_g IS NULL OR sample_2_g > 0)
            AND (sample_3_g IS NULL OR sample_3_g > 0)
            AND (sample_4_g IS NULL OR sample_4_g > 0)
            AND (sample_5_g IS NULL OR sample_5_g > 0)
            AND (target_weight_g IS NULL OR target_weight_g > 0)
        )
);

COMMENT ON TABLE assembly_packing_logs IS 'FSP-LOG-ASM-001: Assembly & packing inspection. Allergen not declared = batch lockout. Average weight auto-computed from 5 samples.';


-- -------------------------------------------------
-- Table 6: Deviation & CAPA Log (FSP-CAPA-LOG-001)
-- Uses polymorphic reference (source_log_type + source_log_id)
-- to link to any log table.
-- -------------------------------------------------
CREATE TABLE IF NOT EXISTS deviation_logs (
    id                      SERIAL PRIMARY KEY,

    -- Polymorphic source reference
    source_log_type         log_type_enum   NOT NULL,
    source_log_id           INT             NOT NULL,

    -- Deviation details
    description             TEXT            NOT NULL,
    severity                severity_enum   NOT NULL DEFAULT 'Minor',
    immediate_action        immediate_action_enum NOT NULL,
    immediate_action_detail TEXT,

    -- CAPA (Corrective And Preventive Action)
    root_cause              TEXT,
    preventive_action       TEXT,

    -- Closure
    closed_by               INT             REFERENCES users(id),
    closed_at               TIMESTAMPTZ,
    closure_notes           TEXT,

    -- ALCOA+ audit fields
    operator_id             INT             NOT NULL REFERENCES users(id),
    verified_by             INT             REFERENCES users(id),
    is_locked               BOOLEAN         NOT NULL DEFAULT FALSE,
    is_voided               BOOLEAN         NOT NULL DEFAULT FALSE,
    void_reason             TEXT,
    voided_at               TIMESTAMPTZ,
    voided_by               INT             REFERENCES users(id),
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    -- CHECK constraints
    CONSTRAINT chk_deviation_closure_consistency
        CHECK (
            (closed_at IS NULL AND closed_by IS NULL AND closure_notes IS NULL)
            OR (closed_at IS NOT NULL AND closed_by IS NOT NULL)
        )
);

COMMENT ON TABLE deviation_logs IS 'FSP-CAPA-LOG-001: Deviation & CAPA management. Links to any log table via polymorphic reference. Tracks root cause analysis and preventive actions.';


-- ============================================================================
-- SECTION 4: AUDIT LOG TABLE
-- Tracks all modifications to locked records for ALCOA+ compliance.
-- Uses JSONB for flexible before/after value storage.
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_log (
    id              SERIAL PRIMARY KEY,
    table_name      VARCHAR(50)     NOT NULL,
    record_id       INT             NOT NULL,
    action          VARCHAR(20)     NOT NULL,   -- UPDATE, VOID, LOCK, VERIFY
    changed_fields  JSONB,
    old_values      JSONB,
    new_values      JSONB,
    changed_by      INT             REFERENCES users(id),
    changed_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    reason          TEXT
);

COMMENT ON TABLE audit_log IS 'ALCOA+ audit trail. Records all changes to locked/verified records with before/after values in JSONB format.';


-- ============================================================================
-- SECTION 5: TRIGGER FUNCTIONS
-- ============================================================================

-- 5.1: Prevent DELETE on log tables (ALCOA+ requirement: no hard deletes)
CREATE OR REPLACE FUNCTION prevent_log_delete()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'DELETE operations are not permitted on "%" table. Use is_voided = TRUE instead.', TG_TABLE_NAME;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 5.2: Prevent modification of QA-locked records
-- Exception: voiding a locked record IS allowed (with void_reason)
CREATE OR REPLACE FUNCTION prevent_locked_modification()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.is_locked = TRUE THEN
        -- Allow voiding operations on locked records
        IF NEW.is_voided = TRUE AND OLD.is_voided = FALSE THEN
            RETURN NEW;
        END IF;
        RAISE EXCEPTION 'Cannot modify locked record (id=%) in "%" table. Record has been QA-verified. Void and re-enter if correction is needed.', OLD.id, TG_TABLE_NAME;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5.3: Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- SECTION 6: APPLY TRIGGERS TO TABLES
-- ============================================================================

-- 6.1: Prevent DELETE triggers (all log tables + audit_log)
CREATE TRIGGER trg_prevent_delete_receiving_logs
    BEFORE DELETE ON receiving_logs FOR EACH ROW
    EXECUTE FUNCTION prevent_log_delete();

CREATE TRIGGER trg_prevent_delete_cooking_logs
    BEFORE DELETE ON cooking_logs FOR EACH ROW
    EXECUTE FUNCTION prevent_log_delete();

CREATE TRIGGER trg_prevent_delete_cooling_logs
    BEFORE DELETE ON cooling_logs FOR EACH ROW
    EXECUTE FUNCTION prevent_log_delete();

CREATE TRIGGER trg_prevent_delete_sanitising_logs
    BEFORE DELETE ON sanitising_logs FOR EACH ROW
    EXECUTE FUNCTION prevent_log_delete();

CREATE TRIGGER trg_prevent_delete_assembly_packing_logs
    BEFORE DELETE ON assembly_packing_logs FOR EACH ROW
    EXECUTE FUNCTION prevent_log_delete();

CREATE TRIGGER trg_prevent_delete_deviation_logs
    BEFORE DELETE ON deviation_logs FOR EACH ROW
    EXECUTE FUNCTION prevent_log_delete();

CREATE TRIGGER trg_prevent_delete_audit_log
    BEFORE DELETE ON audit_log FOR EACH ROW
    EXECUTE FUNCTION prevent_log_delete();

-- 6.2: Prevent locked record modification triggers (all log tables)
CREATE TRIGGER trg_prevent_locked_mod_receiving_logs
    BEFORE UPDATE ON receiving_logs FOR EACH ROW
    EXECUTE FUNCTION prevent_locked_modification();

CREATE TRIGGER trg_prevent_locked_mod_cooking_logs
    BEFORE UPDATE ON cooking_logs FOR EACH ROW
    EXECUTE FUNCTION prevent_locked_modification();

CREATE TRIGGER trg_prevent_locked_mod_cooling_logs
    BEFORE UPDATE ON cooling_logs FOR EACH ROW
    EXECUTE FUNCTION prevent_locked_modification();

CREATE TRIGGER trg_prevent_locked_mod_sanitising_logs
    BEFORE UPDATE ON sanitising_logs FOR EACH ROW
    EXECUTE FUNCTION prevent_locked_modification();

CREATE TRIGGER trg_prevent_locked_mod_assembly_packing_logs
    BEFORE UPDATE ON assembly_packing_logs FOR EACH ROW
    EXECUTE FUNCTION prevent_locked_modification();

CREATE TRIGGER trg_prevent_locked_mod_deviation_logs
    BEFORE UPDATE ON deviation_logs FOR EACH ROW
    EXECUTE FUNCTION prevent_locked_modification();

-- 6.3: Auto-update timestamp trigger (users table)
CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();


-- ============================================================================
-- SECTION 7: INDEXES
-- ============================================================================

-- 7.1: Foreign Key Indexes
-- receiving_logs
CREATE INDEX IF NOT EXISTS idx_receiving_logs_supplier_id   ON receiving_logs(supplier_id);
CREATE INDEX IF NOT EXISTS idx_receiving_logs_operator_id   ON receiving_logs(operator_id);
CREATE INDEX IF NOT EXISTS idx_receiving_logs_verified_by   ON receiving_logs(verified_by) WHERE verified_by IS NOT NULL;

-- cooking_logs
CREATE INDEX IF NOT EXISTS idx_cooking_logs_product_id      ON cooking_logs(product_id);
CREATE INDEX IF NOT EXISTS idx_cooking_logs_equipment_id    ON cooking_logs(equipment_id) WHERE equipment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cooking_logs_operator_id     ON cooking_logs(operator_id);
CREATE INDEX IF NOT EXISTS idx_cooking_logs_verified_by     ON cooking_logs(verified_by) WHERE verified_by IS NOT NULL;

-- cooling_logs
CREATE INDEX IF NOT EXISTS idx_cooling_logs_operator_id     ON cooling_logs(operator_id);
CREATE INDEX IF NOT EXISTS idx_cooling_logs_verified_by     ON cooling_logs(verified_by) WHERE verified_by IS NOT NULL;

-- sanitising_logs
CREATE INDEX IF NOT EXISTS idx_sanitising_logs_area_id      ON sanitising_logs(area_id);
CREATE INDEX IF NOT EXISTS idx_sanitising_logs_operator_id  ON sanitising_logs(operator_id);
CREATE INDEX IF NOT EXISTS idx_sanitising_logs_verified_by  ON sanitising_logs(verified_by) WHERE verified_by IS NOT NULL;

-- assembly_packing_logs
CREATE INDEX IF NOT EXISTS idx_assembly_logs_product_id     ON assembly_packing_logs(product_id);
CREATE INDEX IF NOT EXISTS idx_assembly_logs_operator_id    ON assembly_packing_logs(operator_id);
CREATE INDEX IF NOT EXISTS idx_assembly_logs_verified_by    ON assembly_packing_logs(verified_by) WHERE verified_by IS NOT NULL;

-- deviation_logs
CREATE INDEX IF NOT EXISTS idx_deviation_logs_operator_id   ON deviation_logs(operator_id);
CREATE INDEX IF NOT EXISTS idx_deviation_logs_closed_by     ON deviation_logs(closed_by) WHERE closed_by IS NOT NULL;

-- 7.2: Time-range query indexes (created_at)
CREATE INDEX IF NOT EXISTS idx_receiving_logs_created_at    ON receiving_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_cooking_logs_created_at      ON cooking_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_cooling_logs_created_at      ON cooling_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_sanitising_logs_created_at   ON sanitising_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_assembly_logs_created_at     ON assembly_packing_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_deviation_logs_created_at    ON deviation_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_changed_at         ON audit_log(changed_at);

-- 7.3: Batch ID indexes (cross-table batch traceability)
CREATE INDEX IF NOT EXISTS idx_cooking_logs_batch_id        ON cooking_logs(batch_id);
CREATE INDEX IF NOT EXISTS idx_cooling_logs_batch_id        ON cooling_logs(batch_id);
CREATE INDEX IF NOT EXISTS idx_assembly_logs_batch_id       ON assembly_packing_logs(batch_id);

-- 7.4: Composite indexes (common query patterns)
-- Deviation lookup by source log (polymorphic reference)
CREATE INDEX IF NOT EXISTS idx_deviation_logs_source
    ON deviation_logs(source_log_type, source_log_id);

-- Audit log lookup by table + record
CREATE INDEX IF NOT EXISTS idx_audit_log_table_record
    ON audit_log(table_name, record_id);

-- 7.5: Partial indexes (active/non-voided records)
CREATE INDEX IF NOT EXISTS idx_cooking_logs_active
    ON cooking_logs(created_at) WHERE is_voided = FALSE;

CREATE INDEX IF NOT EXISTS idx_cooling_logs_active
    ON cooling_logs(created_at) WHERE is_voided = FALSE;

CREATE INDEX IF NOT EXISTS idx_receiving_logs_active
    ON receiving_logs(created_at) WHERE is_voided = FALSE;

CREATE INDEX IF NOT EXISTS idx_sanitising_logs_active
    ON sanitising_logs(created_at) WHERE is_voided = FALSE;

CREATE INDEX IF NOT EXISTS idx_assembly_logs_active
    ON assembly_packing_logs(created_at) WHERE is_voided = FALSE;

-- Open deviations (not closed, not voided)
CREATE INDEX IF NOT EXISTS idx_deviation_logs_open
    ON deviation_logs(created_at)
    WHERE closed_at IS NULL AND is_voided = FALSE;


-- ============================================================================
-- SECTION 8: SEED DATA
-- ============================================================================

-- NOTE: All passwords are "password123" hashed with bcrypt (cost=12).
-- IMPORTANT: Change these passwords in production!
-- The hash below was generated with: passlib.CryptContext(schemes=["bcrypt"]).hash("password123")
-- If deploying fresh, regenerate hashes via the backend's security module.

INSERT INTO users (username, password_hash, full_name, role, is_active) VALUES
    ('operator1', '$2b$12$5nKaD.Zd2qTk59YjACXQaOejzEfWxRWJ6DRMsSDmHZYxIZ6fy7Bym', 'Alice Wong',   'Operator', TRUE),
    ('operator2', '$2b$12$5nKaD.Zd2qTk59YjACXQaOejzEfWxRWJ6DRMsSDmHZYxIZ6fy7Bym', 'Bob Chen',     'Operator', TRUE),
    ('qa1',       '$2b$12$5nKaD.Zd2qTk59YjACXQaOejzEfWxRWJ6DRMsSDmHZYxIZ6fy7Bym', 'Claire Park',  'QA',       TRUE),
    ('manager1',  '$2b$12$5nKaD.Zd2qTk59YjACXQaOejzEfWxRWJ6DRMsSDmHZYxIZ6fy7Bym', 'David Li',     'Manager',  TRUE)
ON CONFLICT (username) DO NOTHING;

INSERT INTO products (name, ccp_limit_temp, is_active) VALUES
    ('Pork Dumplings',          75.00, TRUE),
    ('Chicken Dumplings',       75.00, TRUE),
    ('Beef Dumplings',          75.00, TRUE),
    ('Vegetable Dumplings',     75.00, TRUE),
    ('Spring Rolls',            75.00, TRUE),
    ('Fried Rice',              75.00, TRUE),
    ('豬肚',                    75.00, TRUE),
    ('雞肉塊',                  75.00, TRUE),
    ('牛肉粒',                  75.00, TRUE),
    ('牛湯骨',                  75.00, TRUE),
    ('肥腸',                    75.00, TRUE)
ON CONFLICT DO NOTHING;

INSERT INTO suppliers (name, contact_name, phone, is_active) VALUES
    ('Fresh Meat Co.',          'John Smith',       '+61 3 9000 1111', TRUE),
    ('Green Valley Farms',      'Sarah Johnson',    '+61 3 9000 2222', TRUE),
    ('Ocean Fresh Seafood',     'Mike Lee',         '+61 3 9000 3333', TRUE),
    ('Premier Packaging',       'Lisa Wang',        '+61 3 9000 4444', TRUE)
ON CONFLICT (name) DO NOTHING;

INSERT INTO equipment (name, equipment_type, location, is_active) VALUES
    ('Blanching Pot 1',         'Blanching Pot',    'Cooking Room',     TRUE),
    ('Blanching Pot 2',         'Blanching Pot',    'Cooking Room',     TRUE),
    ('Commercial Oven A',       'Oven',             'Cooking Room',     TRUE),
    ('Deep Fryer 1',            'Fryer',            'Cooking Room',     TRUE),
    ('Blast Chiller 1',         'Chiller',          'Cold Room',        TRUE),
    ('Blast Chiller 2',         'Chiller',          'Cold Room',        TRUE)
ON CONFLICT (name) DO NOTHING;

INSERT INTO areas (name, description, is_active) VALUES
    ('Cooking Room',        'Main cooking and hot preparation area',    TRUE),
    ('Prep Room',           'Cold preparation and assembly area',       TRUE),
    ('Cold Room',           'Refrigerated storage area',                TRUE),
    ('Packing Room',        'Packaging and labelling area',             TRUE),
    ('Receiving Dock',      'Goods receiving and inspection area',      TRUE),
    ('Storage Room',        'Dry goods and ambient storage',            TRUE)
ON CONFLICT (name) DO NOTHING;


-- ============================================================================
-- SECTION 9: INVENTORY MODULE (出入庫管理)
-- ============================================================================

DO $$ BEGIN
    CREATE TYPE inv_doc_type_enum AS ENUM ('IN', 'OUT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE inv_doc_status_enum AS ENUM ('Draft', 'Posted', 'Voided');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Item master (品項)
CREATE TABLE IF NOT EXISTS inv_items (
    id            SERIAL PRIMARY KEY,
    code          VARCHAR(50)  UNIQUE NOT NULL,
    name          VARCHAR(200) NOT NULL,
    category      VARCHAR(100),
    base_unit     VARCHAR(20)  NOT NULL DEFAULT 'PCS',
    description   TEXT,
    supplier_id   INTEGER REFERENCES suppliers(id),
    is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Warehouse locations (儲位)
CREATE TABLE IF NOT EXISTS inv_locations (
    id        SERIAL PRIMARY KEY,
    code      VARCHAR(50)  UNIQUE NOT NULL,
    name      VARCHAR(200) NOT NULL,
    zone      VARCHAR(100),
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

-- Stock documents / headers (入出庫單)
CREATE TABLE IF NOT EXISTS inv_stock_docs (
    id               SERIAL PRIMARY KEY,
    doc_number       VARCHAR(30)         UNIQUE NOT NULL,
    doc_type         inv_doc_type_enum   NOT NULL,
    status           inv_doc_status_enum NOT NULL DEFAULT 'Draft',
    location_id      INTEGER REFERENCES inv_locations(id),
    receiving_log_id INTEGER REFERENCES receiving_logs(id),
    ref_number       VARCHAR(100),
    notes            TEXT,
    void_reason      TEXT,
    operator_id      INTEGER REFERENCES users(id),
    operator_name    VARCHAR(100),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    posted_at        TIMESTAMPTZ,
    voided_at        TIMESTAMPTZ
);

-- Document lines (明細)
CREATE TABLE IF NOT EXISTS inv_stock_lines (
    id        SERIAL PRIMARY KEY,
    doc_id    INTEGER NOT NULL REFERENCES inv_stock_docs(id) ON DELETE CASCADE,
    item_id   INTEGER NOT NULL REFERENCES inv_items(id),
    quantity  NUMERIC(12,3) NOT NULL CHECK (quantity > 0),
    unit      VARCHAR(20) NOT NULL,
    unit_cost NUMERIC(12,2),
    notes     TEXT
);

-- Running stock balance (庫存)
CREATE TABLE IF NOT EXISTS inv_stock_balance (
    item_id     INTEGER NOT NULL REFERENCES inv_items(id),
    location_id INTEGER NOT NULL REFERENCES inv_locations(id),
    quantity    NUMERIC(12,3) NOT NULL DEFAULT 0,
    PRIMARY KEY (item_id, location_id)
);

-- Movement ledger / audit trail (異動紀錄)
CREATE TABLE IF NOT EXISTS inv_stock_movements (
    id            SERIAL PRIMARY KEY,
    doc_id        INTEGER NOT NULL REFERENCES inv_stock_docs(id),
    item_id       INTEGER NOT NULL REFERENCES inv_items(id),
    location_id   INTEGER NOT NULL REFERENCES inv_locations(id),
    delta         NUMERIC(12,3) NOT NULL,
    balance_after NUMERIC(12,3) NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for inventory module
CREATE INDEX IF NOT EXISTS idx_inv_stock_docs_location  ON inv_stock_docs(location_id);
CREATE INDEX IF NOT EXISTS idx_inv_stock_docs_type      ON inv_stock_docs(doc_type);
CREATE INDEX IF NOT EXISTS idx_inv_stock_docs_status    ON inv_stock_docs(status);
CREATE INDEX IF NOT EXISTS idx_inv_stock_docs_created   ON inv_stock_docs(created_at);
CREATE INDEX IF NOT EXISTS idx_inv_stock_lines_doc      ON inv_stock_lines(doc_id);
CREATE INDEX IF NOT EXISTS idx_inv_stock_lines_item     ON inv_stock_lines(item_id);
CREATE INDEX IF NOT EXISTS idx_inv_stock_movements_doc  ON inv_stock_movements(doc_id);
CREATE INDEX IF NOT EXISTS idx_inv_stock_movements_item ON inv_stock_movements(item_id, location_id);
CREATE INDEX IF NOT EXISTS idx_inv_items_supplier       ON inv_items(supplier_id) WHERE supplier_id IS NOT NULL;


-- ============================================================================
-- INITIALIZATION COMPLETE
-- ============================================================================
-- Schema version: 2.1.0
-- Tables created: 17 (5 reference + 6 log + 1 audit + 5 inventory)
-- Enum types: 10
-- Triggers: 14 (7 delete prevention + 6 lock protection + 1 updated_at)
-- ============================================================================
