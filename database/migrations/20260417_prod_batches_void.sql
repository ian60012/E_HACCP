-- Migration: add soft-delete (void) fields to prod_batches
-- Date: 2026-04-17
-- Idempotent: safe to re-run; uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.
-- Existing rows get is_voided=false (the DEFAULT) so behaviour is unchanged.

ALTER TABLE prod_batches
    ADD COLUMN IF NOT EXISTS is_voided   BOOLEAN     NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS void_reason TEXT,
    ADD COLUMN IF NOT EXISTS voided_at   TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS voided_by   INTEGER     REFERENCES users(id);

CREATE INDEX IF NOT EXISTS ix_prod_batches_is_voided ON prod_batches(is_voided);
