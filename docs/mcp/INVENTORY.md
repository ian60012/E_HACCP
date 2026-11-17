# E_HACCP inventory for the read-only MCP

Survey date: 2026-11-17. This describes the application as it exists in the repository. The MCP server does not add tables, routes, or migrations.

## Auth model

- Login is `POST /api/v1/auth/login` with an OAuth2 password form (`username`, `password`). The response is a JWT signed with `SECRET_KEY` (`HS256`). The `sub` claim is the user id. `ACCESS_TOKEN_EXPIRE_MINUTES` defaults to 30. There is no refresh token.
- Business routes use `Authorization: Bearer`. `get_current_active_user` rejects missing, expired, and inactive users.
- Roles in `user_role_enum`: `Admin`, `QA`, `QC`, `Production`, `Warehouse`, `Captain`.
- `require_role` treats `Captain` as a super-role. A Captain-only route still excludes the other roles. Quality routes additionally consult `quality_role_permissions`; Admin and Captain stay full access so the matrix cannot lock them out.
- `GET /api/v1/auth/demo-token` mints an 8-hour JWT for the username `demo` with no password. The MCP client never calls it.
- There is no read-only application role. A service account is a normal user. The MCP process is the read-only boundary: it may `POST` only to the login URL and otherwise issues `GET`.
- Passwords are bcrypt hashes in `users.password_hash`. User API responses do not include the hash. The optional Postgres role is not granted `users` and can read only `haccp_mcp_users`, which omits `password_hash`.

## Shared compliance behaviour

- HACCP logs use `ALCOAMixin`: `operator_id`, `verified_by`, `is_locked`, `is_voided`, `void_reason`, `voided_at`, `voided_by`, `created_at`.
- Handwritten signatures are PNG data URLs, up to 600 KB, on cooking, cooling, mixing, assembly, production batch creation, production packing, and batch-sheet verification. They are not on the shared mixin. Receiving, sanitising, PPE, and deviation rows have no signature columns.
- New core records require an operator signature. QA lock requires a verifier signature. Older rows can still be read without one. The repository does not record the date that signature enforcement started.
- Lock, void, and update flows write `audit_log` (`action` such as `UPDATE`, `VOID`, `LOCK`, `VERIFY`, plus JSON `old_values` / `new_values`). Nothing in the REST API reads `audit_log`.
- Database triggers block hard deletes and edits of locked regulated rows. Voiding is the soft-delete path.
- `GET /api/v1/admin/activity` is an Admin-only creation feed across cooking, mixing, cooling, receiving, sanitising, deviation, PPE, assembly, batches, and batch sheets. It does not include cleaning checklists. Its `date_to` filter does `datetime(year, month, day + 1)` and raises on the last day of a month. The MCP therefore sends only `date_from` and applies `date_to` locally.

## Read endpoints the MCP calls

All paths are under `/api/v1` unless noted. List routes return `{items, total, skip, limit}` except LabelMaker templates, which return a bare list. `GET /health` and `GET /` are unauthenticated.

| Area | List | Get | List filters that exist |
| --- | --- | --- | --- |
| Receiving `FSP-LOG-001` | `/receiving-logs` | `/receiving-logs/{id}` | `skip`, `limit`, `is_voided`, `supplier_id`, `inv_item_id`. No date range. |
| Cooking CCP `FSP-LOG-004` | `/cooking-logs` | `/cooking-logs/{id}` | `batch_id`, `prod_batch_id`, `is_voided`. No date range. |
| Cooling CCP `FSP-LOG-005` | `/cooling-logs` | `/cooling-logs/{id}` | `batch_id`, `prod_batch_id`, `is_voided`. No date range. |
| Sanitising `FSP-LOG-CLN-001` | `/sanitising-logs` | `/sanitising-logs/{id}` | `area_id`, `is_voided`. No date range. |
| Cleaning `FSP-LOG-CLN-003/005` | `/cleaning-checklists` | `/cleaning-checklists/{id}` | `line_type`, exact `check_date`, `is_voided`. |
| Mixing `FSP-LOG-MIX-001` | `/mixing-logs` | `/mixing-logs/{id}` | `prod_batch_id`, `is_voided`. No date range. |
| PPE `FSP-LOG-PPE-001` | `/ppe-compliance-logs` | `/ppe-compliance-logs/{id}` | `area_id`, exact `check_date`, `is_voided`. Ordered by `created_at`, not `check_date`. |
| Assembly `FSP-LOG-APK-001` | `/assembly-logs` | `/assembly-logs/{id}` | `prod_batch_id`, `is_voided`. No date range. |
| Deviation / CAPA `FSP-CAPA-LOG-001` | `/deviation-logs` | `/deviation-logs/{id}` | `source_log_type`, `severity`, `is_open`, `is_voided`. No date range. |
| Production batches | `/production/batches` | `/production/batches/{id}` | `status`, `date_from`, `date_to`, `product_type`, `meat_state`, `product_code`, `include_voided`. |
| Batch sheets | `/batch-sheets` | `/production/batches/{id}/batch-sheet` | Pagination only. Ordered by `production_date`. |
| Quality | `/quality-control/batches` | `/production/batches/{id}/quality-inspection` | `quality_status`, `process_type`, `date_from`, `date_to`, `search`. |
| Meat | — | `/production/batches/{id}/meat` and `/history` | Batch list filters above. |
| Lots | `/inventory/lots` | — | `item_id`, `location_id`, `positive_only`. No `lot_code`. |
| Stock docs | `/inventory/docs` | `/inventory/docs/{id}` | `doc_type`, `status`, `item_type_scope`, `general_only`. No lot or date filter. |
| Movements | `/inventory/balance/movements` | — | `item_id`, `location_id`, `doc_id`. No `lot_id`. |
| Activity | `/admin/activity` | — | `date_from`, `date_to` (buggy), `module`, `operator_name`. Admin only. |
| Labels | `/labelmaker/templates` | `/labelmaker/templates/{id}` | No pagination. |
| Identity | — | `/auth/me` | — |

`is_voided` on log lists is an exact match, not an “include both” flag. Batch `include_voided` really means include. The MCP treats those differently.

Other read routes exist and are left to the application UI: users, suppliers, equipment, areas, inventory items, locations, balances, stocktakes, products, pack types, repack, production-helper JSON, and quality permission settings. The MCP does not list users.

Write routes (create, patch, lock, void, close, post stock, verify, label PDF, photo upload) remain in the FastAPI app. None are registered as MCP tools.

## Tables and models

| Group | Tables | Notes |
| --- | --- | --- |
| Users | `users` | `password_hash` present. Roles as above. |
| Reference | `suppliers`, `equipment`, `areas` | |
| Receiving | `receiving_logs` | Supplier, product, chilled/frozen temperature, vehicle and packaging pass/fail, `acceptance_status` (`Accept`, `Reject`, `Hold`), `supplier_batch_no`, optional `inv_item_id` and `inv_stock_doc_id`. |
| Cooking CCP | `cooking_logs` | `core_temp`, `ccp_status` (`Pass`, `Fail`, `Deviation`), `corrective_action`, optional `prod_batch_id`. |
| Cooling CCP | `cooling_logs` | Stage 1 and final time/temperature. Rules: 60°C to 21°C within 120 minutes, and to below 5°C within 360 minutes, enforced in `cooling_validator.py`. |
| Sanitising | `sanitising_logs` | Chemical, dilution, ATP RLU, `atp_status`, `corrective_action`. |
| Cleaning | `cleaning_checklists` | `check_date`, `line_type` (`dumpling` or cooking line), JSONB `items` with `result` of `clean`, `needs_cleaning`, or `damaged_faulty`. |
| Mixing | `mixing_logs` | Weights, temperatures, `visual_check`, signatures. |
| Assembly | `assembly_packing_logs` | Allergen and date-code checks, five weight samples, signatures. `label_photo_path` is a filesystem path. |
| PPE | `ppe_compliance_logs` | Nine pass/fail items, `reviewed_by`, free-text `capa_no`. `capa_no` is not a foreign key. |
| NCR / CAPA | `deviation_logs` | This is the nonconformance record. There is no `ncr` table. `source_log_type` plus `source_log_id` point at receiving, cooking, cooling, sanitising, or assembly. Fields include severity, immediate action, root cause, preventive action, and closure. |
| Audit | `audit_log` | Change history. No REST reader. |
| Production | `prod_products`, `prod_pack_types`, `prod_product_pack_config`, `prod_batches`, `prod_forming_trolleys`, `prod_packing_records`, `prod_packing_trim`, `prod_hot_inputs`, `prod_repack_jobs`, `prod_repack_inputs`, `prod_repack_outputs`, `prod_repack_trim` | Batch status `open`, `packed`, `closed`. `process_type` is `forming`, `hot_process`, or `meat_processing`. |
| Batch sheets | `prod_daily_batch_sheets`, `prod_batch_sheet_lines` | One sheet per non-meat batch. |
| Meat | `prod_meat_records`, `prod_meat_inputs`, `prod_meat_steps`, `prod_meat_outputs`, `prod_meat_losses` | Revisions. Workflow `draft`, `submitted`, `verified`, `stocked`. |
| Quality | `prod_batch_quality_inspections`, `quality_role_permissions`, `quality_control_settings` | Status `not_started`, `draft`, `approved`, `rejected`. Signed revisions are immutable. Photos live on disk, not in Postgres. |
| Inventory | `inv_items`, `inv_item_allowed_locations`, `inv_lots`, `inv_locations`, `inv_stock_docs`, `inv_stock_lines`, `inv_stock_balance`, `inv_stock_movements`, `inv_stocktakes`, `inv_stocktake_lines` | Docs are `IN` or `OUT`, status `Draft`, `Posted`, `Voided`. Lots record `origin_type`, `receiving_log_id`, and `prod_batch_id`. |
| Labels | `label_templates` | Names, pack weight, shelf life, nutrition, ingredients, allergen tags, and a recipe JSON document. |
| Production Helper | files under `PRODUCTION_HELPER_DATA_DIR` | Captain-only plans, recipes, and purchase status. Not queried by the MCP. |

## Traceability as the schema actually supports it

There is no customer, shipment, or dispatch table. The chain the data can support is:

1. `receiving_logs.supplier_batch_no` and the receiving row’s stock-in document (`inv_stock_doc_id`).
2. `inv_lots`, which point back to `receiving_log_id` or forward to `prod_batch_id`. System lots use codes such as `RCV-{receiving_log_id}` when the supplier batch is missing.
3. `prod_batches`, with cooking, cooling, mixing, and assembly logs filtered by `prod_batch_id`, plus meat and quality records on that batch.
4. `inv_stock_movements` joined to `inv_stock_docs`. An `OUT` document is the closest record to dispatch, including production stock entry. Positive `delta` is stock in.

The list APIs cannot filter lots by `lot_code` or movements by `lot_id`. The MCP scans capped API pages unless `HACCP_READONLY_DATABASE_URL` is set, in which case `trace_lot` uses fixed `SELECT` statements.

## What the MCP does not change

No router, model, migration, seed, or frontend behaviour is modified. `mcp_server/sql/create_readonly_role.sql` is an operator script. The server never executes it.
