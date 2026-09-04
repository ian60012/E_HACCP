-- Add handwritten signature fields for core HACCP/production records.

ALTER TABLE cooking_logs
  ADD COLUMN IF NOT EXISTS operator_signature_data_url TEXT,
  ADD COLUMN IF NOT EXISTS verifier_signature_data_url TEXT;

ALTER TABLE cooling_logs
  ADD COLUMN IF NOT EXISTS operator_signature_data_url TEXT,
  ADD COLUMN IF NOT EXISTS verifier_signature_data_url TEXT;

ALTER TABLE mixing_logs
  ADD COLUMN IF NOT EXISTS operator_signature_data_url TEXT,
  ADD COLUMN IF NOT EXISTS verifier_signature_data_url TEXT;

ALTER TABLE assembly_packing_logs
  ADD COLUMN IF NOT EXISTS operator_signature_data_url TEXT,
  ADD COLUMN IF NOT EXISTS verifier_signature_data_url TEXT;

ALTER TABLE prod_batches
  ADD COLUMN IF NOT EXISTS operator_signature_data_url TEXT,
  ADD COLUMN IF NOT EXISTS packing_operator_signature_data_url TEXT,
  ADD COLUMN IF NOT EXISTS packing_verified_by INTEGER REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS packing_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS packing_verifier_signature_data_url TEXT;

ALTER TABLE prod_daily_batch_sheets
  ADD COLUMN IF NOT EXISTS operator_signature_data_url TEXT,
  ADD COLUMN IF NOT EXISTS verifier_signature_data_url TEXT;
