-- migrate_roles.sql
-- Migrate user_role_enum from (Operator, QA, Manager) to (Admin, QA, Production, Warehouse)
--
-- Run this on an existing database BEFORE deploying the new backend code.
-- PostgreSQL cannot easily remove old enum values, so 'Manager' and 'Operator'
-- will remain in the enum type but won't be used. That's acceptable.

-- Step 1: Add new enum values (safe to re-run)
ALTER TYPE user_role_enum ADD VALUE IF NOT EXISTS 'Admin';
ALTER TYPE user_role_enum ADD VALUE IF NOT EXISTS 'Production';
ALTER TYPE user_role_enum ADD VALUE IF NOT EXISTS 'Warehouse';

-- Step 2: Migrate existing data
UPDATE users SET role = 'Admin' WHERE role = 'Manager';
UPDATE users SET role = 'Production' WHERE role = 'Operator';

-- Step 3: Change the default column value
ALTER TABLE users ALTER COLUMN role SET DEFAULT 'Production';
