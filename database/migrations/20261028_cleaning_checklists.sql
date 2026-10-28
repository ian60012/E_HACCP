CREATE TABLE IF NOT EXISTS cleaning_checklists (
    id          SERIAL PRIMARY KEY,
    check_date  DATE NOT NULL,
    line_type   VARCHAR(20) NOT NULL CHECK (line_type IN ('dumpling', 'cooking')),
    items       JSONB NOT NULL,
    notes       TEXT,
    operator_id INTEGER NOT NULL REFERENCES users(id),
    verified_by INTEGER REFERENCES users(id),
    is_locked   BOOLEAN NOT NULL DEFAULT FALSE,
    is_voided   BOOLEAN NOT NULL DEFAULT FALSE,
    void_reason TEXT,
    voided_at   TIMESTAMPTZ,
    voided_by   INTEGER REFERENCES users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_cleaning_checklist_items_array CHECK (jsonb_typeof(items) = 'array')
);

-- statement
CREATE INDEX IF NOT EXISTS idx_cleaning_checklists_check_date ON cleaning_checklists(check_date);

-- statement
CREATE INDEX IF NOT EXISTS idx_cleaning_checklists_line_type ON cleaning_checklists(line_type);

-- statement
CREATE INDEX IF NOT EXISTS idx_cleaning_checklists_active
    ON cleaning_checklists(check_date DESC) WHERE is_voided = FALSE;

-- statement
DROP TRIGGER IF EXISTS trg_prevent_delete_cleaning_checklists ON cleaning_checklists;

-- statement
CREATE TRIGGER trg_prevent_delete_cleaning_checklists
    BEFORE DELETE ON cleaning_checklists FOR EACH ROW
    EXECUTE FUNCTION prevent_log_delete();

-- statement
DROP TRIGGER IF EXISTS trg_prevent_locked_mod_cleaning_checklists ON cleaning_checklists;

-- statement
CREATE TRIGGER trg_prevent_locked_mod_cleaning_checklists
    BEFORE UPDATE ON cleaning_checklists FOR EACH ROW
    EXECUTE FUNCTION prevent_locked_modification();
