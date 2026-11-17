-- Read-only Postgres role for the E_HACCP MCP server.
--
-- Do not run this file from the MCP process, from a migration, or against
-- production until a person has reviewed it and replaced the password.
-- The application owner role stays unchanged. This script only adds a login
-- that cannot insert, update, delete, or read password hashes.
--
-- Apply as a superuser, for example:
--   docker exec -i haccp_prod_postgres psql -U haccp_user -d haccp_db \
--     -f - < mcp_server/sql/create_readonly_role.sql
-- Then put the URL in HACCP_READONLY_DATABASE_URL.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'haccp_mcp_ro') THEN
    CREATE ROLE haccp_mcp_ro LOGIN PASSWORD 'replace-with-a-long-random-password';
  END IF;
END
$$;

REVOKE ALL ON DATABASE haccp_db FROM haccp_mcp_ro;
GRANT CONNECT ON DATABASE haccp_db TO haccp_mcp_ro;
REVOKE ALL ON SCHEMA public FROM haccp_mcp_ro;
GRANT USAGE ON SCHEMA public TO haccp_mcp_ro;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM haccp_mcp_ro;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM haccp_mcp_ro;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM haccp_mcp_ro;

-- users is intentionally absent: password_hash must not be selectable.
-- A column-safe view is created below.

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'suppliers', 'equipment', 'areas',
    'receiving_logs', 'cooking_logs', 'cooling_logs', 'sanitising_logs',
    'cleaning_checklists', 'mixing_logs', 'assembly_packing_logs',
    'ppe_compliance_logs', 'deviation_logs', 'audit_log',
    'prod_products', 'prod_pack_types', 'prod_product_pack_config',
    'prod_batches', 'prod_forming_trolleys', 'prod_packing_records', 'prod_packing_trim',
    'prod_hot_inputs', 'prod_repack_jobs', 'prod_repack_inputs', 'prod_repack_outputs',
    'prod_repack_trim', 'prod_daily_batch_sheets', 'prod_batch_sheet_lines',
    'prod_meat_records', 'prod_meat_inputs', 'prod_meat_steps', 'prod_meat_outputs',
    'prod_meat_losses', 'prod_batch_quality_inspections', 'quality_role_permissions',
    'quality_control_settings', 'prod_batch_type_migration_review',
    'inv_items', 'inv_item_allowed_locations', 'inv_lots', 'inv_locations',
    'inv_stock_docs', 'inv_stock_lines', 'inv_stock_balance', 'inv_stock_movements',
    'inv_stocktakes', 'inv_stocktake_lines', 'label_templates'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'skip missing table %', t;
    ELSE
      EXECUTE format('GRANT SELECT ON TABLE public.%I TO haccp_mcp_ro', t);
    END IF;
  END LOOP;
END
$$;

CREATE OR REPLACE VIEW haccp_mcp_users AS
SELECT id, username, full_name, email, role::text AS role, is_active, created_at, updated_at
FROM users;

REVOKE ALL ON haccp_mcp_users FROM PUBLIC;
GRANT SELECT ON haccp_mcp_users TO haccp_mcp_ro;

ALTER ROLE haccp_mcp_ro SET default_transaction_read_only = on;
ALTER ROLE haccp_mcp_ro SET statement_timeout = '5s';

COMMIT;

-- Confirm, still as superuser:
--   SET ROLE haccp_mcp_ro;
--   SELECT current_user, current_setting('transaction_read_only');
--   SELECT COUNT(*) FROM audit_log;
--   -- This must fail:
--   SELECT password_hash FROM users;
-- After a future migration adds a table, re-run the GRANT block. New tables
-- are not granted automatically.
