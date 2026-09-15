-- Additive migration: existing and automatically generated documents remain general.
ALTER TABLE inv_stock_docs ADD COLUMN IF NOT EXISTS item_type_scope item_type_enum;
CREATE INDEX IF NOT EXISTS ix_inv_stock_docs_item_type_scope ON inv_stock_docs(item_type_scope);
