-- Migration: add LabelMaker templates linked by production product and pack type

CREATE TABLE IF NOT EXISTS label_templates (
    id                      SERIAL PRIMARY KEY,
    prod_product_id         INTEGER NOT NULL REFERENCES prod_products(id) ON DELETE CASCADE,
    pack_type_code          VARCHAR(50) NOT NULL,
    product_name_zh         VARCHAR(200) NOT NULL DEFAULT '',
    product_name_en         VARCHAR(200) NOT NULL,
    net_weight_g            NUMERIC(10,2) NOT NULL,
    serving_size_g          NUMERIC(10,2) NOT NULL,
    servings_per_package    NUMERIC(8,2) NOT NULL DEFAULT 1,
    storage_conditions      TEXT NOT NULL,
    customer_text           TEXT NOT NULL,
    shelf_life_days         INTEGER NOT NULL DEFAULT 365,
    nutrition_per_100g      JSONB NOT NULL,
    ingredients             JSONB NOT NULL,
    recipe                  JSONB,
    allergens_confirmed_at  TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_label_template_product_pack UNIQUE (prod_product_id, pack_type_code)
);

CREATE INDEX IF NOT EXISTS idx_label_templates_product ON label_templates(prod_product_id);
