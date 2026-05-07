-- Migration: Add Captain role for production_helper module access
-- Date: 2026-05-04
--
-- Adds 'Captain' value to user_role_enum so users can be assigned this role.
-- Captain role is used to gate access to the production_helper module
-- (週生產計畫 / 配方庫 / 叫貨總覽).

ALTER TYPE user_role_enum ADD VALUE IF NOT EXISTS 'Captain';
