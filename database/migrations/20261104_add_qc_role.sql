-- Add the focused Quality Control operator role to existing installations.
ALTER TYPE user_role_enum ADD VALUE IF NOT EXISTS 'QC';

INSERT INTO quality_role_permissions (role, can_view, can_edit, can_verify)
VALUES ('QC', TRUE, TRUE, TRUE)
ON CONFLICT (role) DO NOTHING;
