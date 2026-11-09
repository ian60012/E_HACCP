-- Add the focused Quality Control operator role to existing installations.
-- Create the enum when this database never received the base schema type,
-- then add any canonical label it is missing. Existing labels stay put.
DO $$ BEGIN
    CREATE TYPE user_role_enum AS ENUM ('Admin', 'QA', 'QC', 'Production', 'Warehouse', 'Captain');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
ALTER TYPE user_role_enum ADD VALUE IF NOT EXISTS 'Admin';
ALTER TYPE user_role_enum ADD VALUE IF NOT EXISTS 'QA';
ALTER TYPE user_role_enum ADD VALUE IF NOT EXISTS 'QC';
ALTER TYPE user_role_enum ADD VALUE IF NOT EXISTS 'Production';
ALTER TYPE user_role_enum ADD VALUE IF NOT EXISTS 'Warehouse';
ALTER TYPE user_role_enum ADD VALUE IF NOT EXISTS 'Captain';

INSERT INTO quality_role_permissions (role, can_view, can_edit, can_verify)
VALUES ('QC', TRUE, TRUE, TRUE)
ON CONFLICT (role) DO NOTHING;
