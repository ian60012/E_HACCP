# E_HACCP Project Context

Last updated: 2026-11-04.

## Quick Load

This repository is the FD Catering HACCP eQMS system. It digitizes HACCP, production, inventory, label, and audit workflows for a food manufacturing operation.

Before each development task:

1. Read this file first.
2. For backend work, inspect the matching files in `backend/app/routers/api/v1`, `backend/app/schemas`, `backend/app/models`, and `backend/app/services`.
3. For frontend work, inspect `frontend/src/App.tsx`, the matching page under `frontend/src/pages`, matching API wrapper under `frontend/src/api`, and matching type file under `frontend/src/types`.
4. For database work, treat `database/init.sql` plus dated files in `database/migrations` as the durable schema record. `backend/app/main.py` also contains startup-time idempotent migrations and seeds.
5. For behavior affecting audit, QA lock, voiding, CCP validation, inventory posting, batch closing, or Captain permissions, inspect existing service code before editing.

## Stack

- Backend: FastAPI, SQLAlchemy async, Pydantic v2, asyncpg.
- Frontend: React 18, TypeScript, Vite, Tailwind CSS, axios, React Router.
- Database: PostgreSQL through Docker Compose.
- Dev ports: frontend `3000`, backend `8000`, Postgres `5555`, Adminer `9090`.
- Prod compose ports: frontend `3001`, backend `8001`, Postgres host port `5556`.

Useful commands:

```powershell
docker compose up -d --build
docker compose ps
docker compose logs -f backend
docker exec haccp_frontend sh -c "cd /app && npm run build"
docker exec haccp_backend pytest
```

## Known Drift

- `README.md`, `TESTING.md`, and some docs have mojibake/encoding damage.
- `README.md` and `docs/cursor_project_brief.md` mention Vue, but the actual frontend is React/Vite.
- `docs/cursor_project_brief.md` is an early MVP brief, not the current architecture.
- Adminer is mapped to host port `9090` in current `docker-compose.yml`, although old docs mention `8080`.
- `prod_batch_status_enum` differs across history. The 2026-09-15 meat migration idempotently adds `packed` to older installations; meat workflow states are separate from this enum.

## Repository Map

- `backend/app/main.py`: FastAPI app, router registration, startup DB checks, idempotent migrations, seed data, Production Helper data init.
- `backend/app/core`: settings, async DB engine/session, security helpers.
- `backend/app/dependencies/auth.py`: JWT current user and role checks. Captain behaves as elevated role in several places.
- `backend/app/models`: SQLAlchemy ORM models and enums.
- `backend/app/schemas`: Pydantic request/response models.
- `backend/app/routers/api/v1`: REST API modules under `/api/v1`.
- `backend/app/services`: shared domain services for validation, audit, void, lock, inventory, and production calculations.
- `database/init.sql`: initial schema, enums, triggers, seed data.
- `database/migrations`: incremental SQL changes for existing databases.
- `frontend/src/App.tsx`: route table and role gating.
- `frontend/src/api`: axios API wrappers.
- `frontend/src/types`: TypeScript interfaces mirroring backend schemas.
- `frontend/src/pages`: route-level screens by module.
- `frontend/src/components`: layout, navigation, guards, shared UI.
- `frontend/src/features/labelmaker`: LabelMaker domain logic, FSANZ data, recipe/nutrition/allergen utilities.
- `docs/production_helper_integration.md`: Production Helper integration notes, useful but mojibake-damaged.

## Backend Architecture

The backend mounts all routers in `backend/app/main.py` under `/api/v1`.

Core routers:

- Auth/users/admin: `auth.py`, `users.py`, `admin.py`.
- Reference data: `suppliers.py`, `equipment.py`, `areas.py`.
- HACCP logs: `receiving_logs.py`, `cooking_logs.py`, `cooling_logs.py`, `sanitising_logs.py`, `cleaning_checklists.py`, `deviation_logs.py`, `ppe_compliance_logs.py`, `mixing_logs.py`, `assembly_packing_logs.py`.
- Inventory: `inventory_items.py`, `inventory_locations.py`, `inventory_docs.py`, `inventory_balance.py`, `inventory_lots.py`, `inventory_stocktake.py`.
- Production: `production_products.py`, `production_pack_types.py`, `production_batches.py`, `production_repack.py`, `batch_sheets.py`.
- Production Helper: `production_helper.py`.
- LabelMaker: `labelmaker.py`.

Common router pattern:

- Create a module-level `APIRouter(prefix=..., tags=[...])`.
- Use `AsyncSession = Depends(get_db)`.
- Use Pydantic schemas for request/response.
- Build list/detail queries with SQLAlchemy `select`.
- For ALCOA+ logs, support list, detail, create, patch, lock, and void endpoints.
- Use services for domain behavior that is shared or sensitive.

## Domain Services

- `ccp_validator.py`: cooking CCP validation.
- `cooling_validator.py`: cooling stage validation and failure descriptions.
- `receiving_validator.py`: receiving acceptance validation.
- `sanitising_validator.py`: ATP/sanitising validation.
- `deviation_service.py`: automatic deviation creation and lookup.
- `audit_service.py`: audit log entries.
- `qa_lock_service.py`: QA locking.
- `void_service.py`: generic log voiding.
- `production_void_service.py`: production batch voiding.
- `inventory_service.py`: stock docs, posting, voiding, stocktake, receiving-to-stock-in.
- `production_service.py`: batch codes, forming/packing/repack totals, hot process balance, enter batch to inventory.

When changing regulated behavior, keep service logic central and avoid duplicating rules in routers or pages.

## Database Model Areas

Base schema includes:

- Users and roles: `users`, enum `user_role_enum` with `Admin`, `QA`, `QC`, `Production`, `Warehouse`, `Captain`. `QC` is a focused batch-quality role and is routed to the quality-control workspace rather than general HACCP, production, inventory, or administration screens.
- Reference: `suppliers`, `equipment`, `areas`.
- HACCP logs: `receiving_logs`, `cooking_logs`, `cooling_logs`, `sanitising_logs`, `cleaning_checklists`, `assembly_packing_logs`, `ppe_compliance_logs`, `mixing_logs`.
- CAPA/deviation: `deviation_logs`.
- Audit: `audit_log`.
- Production: `prod_products`, `prod_pack_types`, `prod_product_pack_config`, `prod_batches`, `prod_forming_trolleys`, `prod_packing_records`, `prod_packing_trim`, `prod_repack_*`, `prod_hot_inputs`, `prod_daily_batch_sheets`, `prod_batch_sheet_lines`.
- Inventory: `inv_items`, `inv_locations`, `inv_lots`, `inv_stock_docs`, `inv_stock_lines`, `inv_item_allowed_locations`, `inv_stock_balance`, `inv_stock_movements`, `inv_stocktakes`, `inv_stocktake_lines`.
- LabelMaker: `label_templates`.

Important compliance behavior:

- Many log models use `ALCOAMixin` from `backend/app/models/base.py`.
- DB triggers in `database/init.sql` prevent deletes and locked-record modification for regulated logs.
- Void flows should mark records voided instead of deleting.
- Lock flows should preserve auditability.

## Frontend Architecture

Routing lives in `frontend/src/App.tsx`.

Major pages:

- `/`: `PortalPage`.
- `/haccp`: `DashboardPage`.
- `/production*`: production dashboard, batches, packing, repack, products, pack types.
- `/labelmaker`: LabelMaker.
- `/cooking-logs`, `/receiving-logs`, `/cooling-logs`, `/sanitising-logs`, `/cleaning-checklists`, `/mixing-logs`, `/ppe-compliance-logs`, `/deviations`, `/assembly-logs`.
- `/batch-sheets`.
- `/reference/suppliers`, `/reference/equipment`, `/reference/areas`.
- `/users`, `/admin/activity`.
- `/inventory/*`: items, raw materials, intermediates, finished goods, packaging materials, locations, docs, balance, stocktakes.
- `/production-helper*`: Captain-only Production Helper.

API access:

- `frontend/src/api/client.ts` creates the axios client.
- In dev, API base defaults to current hostname port `8000`.
- In production, API base is relative so nginx can proxy `/api`.
- JWT is stored in `localStorage` as `auth_token`.
- A 401 response clears the token and redirects to `/login`.

Role logic:

- Backend role dependency is in `backend/app/dependencies/auth.py`.
- Frontend role UI is in `RoleGuard`, `RoleGate`, `usePermissions`, `Sidebar`, and route wrappers in `App.tsx`.
- Captain is special and should be checked carefully whenever role changes are made.

## Module Notes

### HACCP Logs

Cooking, cooling, receiving, sanitising, mixing, PPE, assembly, and deviation logs follow similar backend/frontend layout:

- Backend router: `backend/app/routers/api/v1/<module>.py`.
- Backend schema: `backend/app/schemas/<module>.py`.
- Backend model: `backend/app/models/<module>.py`.
- Frontend API: `frontend/src/api/<module>.ts`.
- Frontend type: `frontend/src/types/<module>.ts`.
- Frontend pages: `frontend/src/pages/<module>/`.

Before editing one module, compare a neighboring module with the same list/detail/form/lock/void pattern.

### Daily Cleaning Checklists

- FSP-LOG-CLN-003 (Dumpling Line) and FSP-LOG-CLN-005 (Cooking Line) are available from the main portal, HACCP dashboard and HACCP sidebar at `/cleaning-checklists`.
- Both supplied source forms contain the same 22 bilingual equipment/scope items grouped under Cooking Room, Processing Room, General Area and Storage Area. The line type controls the title and form code; the saved checklist retains a full bilingual JSONB snapshot of every item, result and comment.
- Results are `clean`, `needs_cleaning` or `damaged_faulty`; every item requires a result before create/update. The JWT user is the attributable operator, QA/Admin can lock, and Admin can void. Hard delete is blocked by a database trigger.
- Backend: `backend/app/models/cleaning_checklist.py`, `backend/app/schemas/cleaning_checklist.py`, `backend/app/routers/api/v1/cleaning_checklists.py`, and `backend/app/services/cleaning_checklist_template.py`.
- Frontend: `frontend/src/pages/cleaning`, `frontend/src/api/cleaning-checklists.ts`, and `frontend/src/types/cleaning-checklist.ts`.
- Durable schema: `database/migrations/20261028_cleaning_checklists.sql`, mirrored by `backend/app/core/cleaning_checklists.sql` for startup migration and appended to `database/init.sql` for new installs.

Core production/HACCP signature behavior:

- Cooking, cooling, mixing, assembly packing, production batch creation, production packing, and daily batch sheets require an operator handwritten signature for new records.
- QA lock/verify actions for those core records require a verifier handwritten signature in the request body.
- Signatures are PNG Data URLs stored in nullable `TEXT` columns so old records without signatures remain readable. Production batch creation and packing operator signatures use separate columns so later packing cannot overwrite the original batch signature.
- Signature columns are declared only on the four signed ALCOA models, not on the shared `ALCOAMixin`; receiving, sanitising, PPE, and deviation tables do not carry signature columns.
- `backend/app/schemas/common.py` owns the shared signature validator and `QALockRequest`.
- `frontend/src/components/SignaturePad.tsx` and `SignatureLockDialog.tsx` are the shared UI pieces.
- `ALCOAAuditBar` displays operator/verifier signature previews alongside existing ALCOA+ metadata.

### Production

Production uses product master data, dynamic pack type configuration, batches, forming trolley estimates, hot-process inputs, packing records, trim, repack jobs, carton label PDF generation, stock entry, and batch voiding.

Key backend files:

- `production_products.py`
- `production_pack_types.py`
- `production_batches.py`
- `production_repack.py`
- `production_service.py`
- `production_void_service.py`
- `backend/app/models/production.py`
- `backend/app/schemas/production.py`

Key frontend files:

- `frontend/src/pages/production/*`
- `frontend/src/api/production.ts`
- `frontend/src/types/production.ts`

### Batch Quality Control

- Every forming, hot-process, and meat-processing batch exposes a dedicated quality inspection at `/production/batches/:id/quality`; batch lists and detail pages display `not_started`, `draft`, `approved`, or `rejected` status.
- `/quality-control` is the dedicated responsive QC workspace. It combines forming, hot-process, and meat-processing batches, shows status counters, supports process/date/text filters, and prioritizes draft, rejected, and not-started work. Its list API is `GET /api/v1/quality-control/batches`. Admin and QA may also open the workspace; QC users see only this system card and its focused sidebar in the frontend.
- The inspection records colour, aroma, and taste as `pass`, `fail`, or `not_applicable`; an N/A reason is mandatory when used, and any failed result requires corrective action before QA sign-off.
- Retained-sample fields cover whether a sample was retained, auto-generated sample code, quantity/unit, sample time, storage condition/location, disposal due date, and a mandatory reason when no sample is retained. One optional JPEG/PNG/WebP photo up to 5 MB is stored outside PostgreSQL under `QUALITY_PHOTO_DIR`; Docker persists it in `quality_photo_data` / `quality_photo_data_prod`, while the database stores protected metadata only.
- `prod_batch_quality_inspections` is revisioned per batch. Drafts remain editable; authorized quality signing sets `approved` or `rejected` and a database trigger makes signed revisions immutable. A rejected result can start a new corrective revision without rewriting history. Hard deletion is blocked.
- `quality_role_permissions` controls `can_view`, `can_edit`, and `can_verify` for QA, QC, Production, and Warehouse. Admin and Captain remain fixed full-access roles to prevent lockout. Admins manage the matrix at `/admin/quality-permissions`; API authorization is enforced server-side by `services/quality_control.py`.
- Default permissions: QA and QC view/edit/verify; Production view/edit; Warehouse view; Admin and Captain full access. Edit or verify always requires view.
- API routes under `/api/v1/production/batches/{batch_id}/quality-inspection` support context/read, draft save, corrective revision, QA verify, authenticated photo upload/read; `/api/v1/quality-control/permissions` manages the role matrix.
- `quality_control_settings.enforcement_started_at` is seeded when the migration first runs. Batches created on or after that timestamp require an approved inspection before either legacy or meat stock entry; older batches remain compatible. The gate is enforced in backend stock services, not only in the UI.
- Backend: `models/quality_control.py`, `schemas/quality_control.py`, `routers/api/v1/quality_control.py`, and `services/quality_control.py`. Frontend: `pages/quality-control/QualityControlDashboardPage.tsx`, `pages/production/QualityInspectionPage.tsx`, `pages/admin/QualityPermissionsPage.tsx`, `api/qualityControl.ts`, and `types/qualityControl.ts`.
- Durable schema: `database/migrations/20261104_batch_quality_control.sql`, follow-up role migration `database/migrations/20261104_add_qc_role.sql`, packaged startup migration `backend/app/core/quality_control.sql`, and the matching block in `database/init.sql`.

### Meat Processing

- Product type `meat_processing` supports raw meat preparation: thaw, trim, slice, dice, mince and marinate. Production Helper's JSON planning station remains independent.
- Every new production batch has a server-assigned immutable `process_type` snapshot. Legacy batches are backfilled from matching products; unresolved rows remain NULL and appear in `prod_batch_type_migration_review`. NULL batches retain legacy product lookup behavior.
- Batch creation requires the requested `process_type`; the backend rejects a product whose `product_type` differs. The product list and `/production/products/forming-options` accept a `product_type` filter, and `/production/batches/new` redirects to the production dashboard unless a valid category is present. This keeps each create page limited to products from its own category.
- Main model: `backend/app/models/meat_processing.py`. `prod_meat_records` holds numbered revisions; `prod_meat_inputs`, `prod_meat_steps`, `prod_meat_outputs`, and `prod_meat_losses` belong to each revision. Each save creates a fresh draft revision; historical rows are not deleted or replaced.
- Workflow: `draft -> submitted -> verified -> stocked`. Saving a submitted revision creates a new unsigned draft. Verification locks the aggregate; corrections after verification require voiding and recreation. Shared `prod_batches.status` stays `open` until stock entry sets `closed`.
- API: `/api/v1/production/batches/{batch_id}/meat` supports GET and PUT; `/history` GET, `/complete` POST, `/verify` POST and `/enter-stock` POST. Writes include the currently loaded `version`; a stale revision returns 409. Batch list supports `product_type=meat_processing` and `meat_state` filtering with summaries.
- Services: `backend/app/services/meat_processing.py` centralizes validation, decimal totals, signatures, revision checks, batch row locking, audit entries and kg stock posting. New detail rows are protected by append-only database triggers; verified batch metadata is protected too.
- Meat saves use `frontend/src/utils/meatProcessing.ts:toMeatSavePayload` to send only writable root/detail fields. API response snapshots (`item_name`, `source_location_name`, `source_lot_code`, `location_name`) remain available for display but must not be sent back to strict request schemas. Regression coverage: `cd frontend && node --test tests/meat-save-payload.test.mjs`; TypeScript compilation checks the serializer's field types.
- Inputs record item, source location, measured kg and either a selected source lot or supplier/source-batch details for an untracked item. Lot-tracked inputs derive supplier, source batch and receiving reference from the lot and retain snapshots on the revision. All added processing steps need start/end times before submission; optional temperature and measurement time must be supplied together. No automatic temperature compliance judgment.
- Outputs may link active intermediate/finished items or raw items enabled as dual-use meat outputs. They must use `kg` (case-insensitive) or `公斤` and a valid allowed location. Stock entry atomically posts `OUT-MEAT-{batch_id}` for measured inputs and `IN-MEAT-{batch_id}` for measured outputs. Lot-tracked outputs use one production lot per batch and SKU across all locations. Reusable by-products are outputs, not losses. Nonzero input-output-loss differences require an explanation before completion.
- Meat products use optional `prod_products.inv_item_id` as the default output SKU. Product management displays the SKU code/name and offers active kg intermediate/finished or dual-use output items with allowed locations; create/update validates eligibility and an active allowed location. Adding the first output row preselects the valid default while still requiring measured weight and a location. Additional rows remain independently selectable; changing a product default never rewrites saved batch output rows. Unlinked generic processing products remain supported. Existing schema is reused without migration.
- Create/edit/complete: Admin or Production; verify: Admin or QA; stock: Admin, Production or Warehouse; void: Admin. Captain retains all permissions. Completion and QA signatures are separate from batch-creation signatures.
- Legacy batch mutations (packing, trolley, hot inputs, generic updates/stock entry, batch-sheet writes) reject meat batches. Meat batches are excluded from the daily batch-sheet list. Inventory documents linked to meat batches must be voided through the batch flow so workflow and inventory stay consistent.
- Shared inventory posting, voiding and stocktake confirmation acquire a transaction-scoped `SHARE ROW EXCLUSIVE` lock on `inv_stock_balance` before reading balances. This serializes stock writers, including legacy writers, to prevent lost increments; read-only balance queries remain available.
- UI: meat processing is entered from the `/production` dashboard, then uses `/production/meat` and `/production/meat/:id` for responsive inputs, steps, outputs/losses, summaries, history and signing. Creation reuses `/production/batches/new?type=meat_processing`. Existing detail and packing URLs redirect meat batches to their dedicated page. Warehouse can enter the production dashboard but sees only the meat processing card and matching production navigation.
- Meat labels: `POST /api/v1/production/batches/{batch_id}/meat/carton-label-pdf` accepts the current saved version, ordered `output_index`, measured carton `net_weight_kg`, optional carton `pack_count`, and packing date. It generates the same 100×75 mm PDF/Code128 batch barcode as legacy carton labels using shared `services/production_labels.py`. The label uses the output item name snapshot, SKU, location, packaging, dates and workflow/QA state; it never estimates per-pack weight. Stale versions, voided batches, invalid output selections and quantities exceeding the saved output are rejected. Label generation is read-only and remains available after QA locking/stock entry. `MeatLabelDialog.tsx` supports separate labels for each output; unsaved/historical views cannot print.
- Meat finished labels: `MeatFinishedLabelDialog.tsx` reuses saved Label Maker templates and `/api/v1/labelmaker/render-pdf` with an explicit `template_id` and batch production date. Finished labels can print immediately after batch creation, before processing details or output rows are filled/saved, and while detail edits are unsaved. The batch-product source loads that product's saved templates, falling back to templates linked to its default output SKU; saved output sources use `/labelmaker/templates?inv_item_id=...`, matching a direct production-product link or forming pack configuration. An exact saved-output pack match or a sole candidate is preselected. Saved ingredient/nutrition/storage/pack weight remain unchanged; expiry follows the saved shelf life. Printing never saves processing details or changes inventory/workflow. Busy/historical/voided guards remain; carton labels still require saved, current output data. Existing forming/hot label rendering retains its behavior. No schema migration is needed.
- Production category colors are consistent across the dashboard, sidebar accents, product/pack badges and batch pages: forming uses blue, hot processing uses orange, and meat processing uses violet.
- Packaging `both` continues to mean forming plus hot process only. Meat packaging must explicitly use `applicable_type=meat_processing`.
- Migration sources packaged with backend: `backend/app/core/meat_processing.sql` and `backend/app/core/inventory_lots.sql`; identical SQL is in the corresponding `database/migrations/20260915_*.sql` files and appended to `database/init.sql`. Startup calls `migrate_meat` and then `migrate_inventory_lots`. Keep each set of copies synchronized; tests enforce this.
- Verification and rollout instructions: `docs/meat_processing_rollout.md`; PostgreSQL integration coverage: `backend/tests/test_meat_processing.py`.

### Inventory

Inventory supports item master data, locations, lot-aware stock documents, posted/voided stock movement, balances, receiving-log conversion to stock-in, allowed locations, and stocktake adjustment docs.

- Manual stock documents persist nullable `item_type_scope` using `item_type_enum`. NULL is general/unrestricted; IN supports raw/packaging/intermediate/finished, OUT supports intermediate/finished. Creation, draft replacement and posting centrally validate the scope and every line in `inventory_service.validate_document_scope`. Raw dual-use meat items also qualify for their intermediate/finished output scope. Old and automatically generated documents remain NULL without backfill.
- Stock-document list API accepts `item_type_scope` and `general_only` (general-only takes precedence), with direction/status filters applied to both rows and totals. The UI offers grouped quick-create links, scoped active-item selection, draft scope editing and scope badges. Direction remains immutable after creation.

- `inv_items.lot_tracking_enabled` opts a SKU into lot stock. `meat_output_type` lets a raw SKU also appear as a meat-produced intermediate or finished item while preserving its `raw` classification for receiving and Batch Sheets.
- Admin/Captain can call `POST /api/v1/inventory/items/{item_id}/enable-meat-product`. It requires a KG item and an allowed location, creates or links the same-code `meat_processing` production product, and moves existing location balances to one generated `LEGACY-{SKU}-{date}` lot without changing quantities. A conflicting production product code aborts the transaction.
- `inv_lots` records receiving, meat-processing, legacy and manual-adjustment sources. Balance rows use a surrogate key plus partial uniqueness for untracked item/location and tracked item/location/lot. Default balance responses remain aggregated by SKU/location and include optional lot expansion. `GET /api/v1/inventory/lots` filters availability by item, location and positive balance.
- Receiving stores the supplier batch number. Conversion creates a receiving lot; a missing supplier batch becomes system lot `RCV-{receiving_log_id}`. The locked-record trigger permits only the one-time stock-document link needed after QA lock.
- General lot-tracked OUT lines require an explicit existing lot. General IN lines may select an existing lot or create a manual-adjustment lot. Lot-aware quantities use KG with three decimal places. Movement `balance_after` is the balance of that exact lot.
- Stocktakes snapshot each tracked lot separately and allow Warehouse to add a discovered lot. Adjustment documents retain the selected lot. Historical lines and movements with `lot_id = NULL` remain readable.
- Meat batch void reverses output lots before restoring input lots. It refuses the void if a produced lot has been consumed and no longer has enough stock for reversal. Direct voiding of either linked meat stock document is blocked.

Key backend files:

- `inventory_items.py`
- `inventory_locations.py`
- `inventory_docs.py`
- `inventory_balance.py`
- `inventory_lots.py`
- `inventory_stocktake.py`
- `inventory_service.py`
- `backend/app/models/inventory.py`
- `backend/app/schemas/inventory.py`

Key frontend files:

- `frontend/src/pages/inventory/*`
- `frontend/src/api/inventory.ts`
- `frontend/src/types/inventory.ts`

### Production Helper

Production Helper is Captain-only. It reads products, batches, and inventory items from Postgres, but persists plans, recipes, and purchase status as JSON under `PRODUCTION_HELPER_DATA_DIR`.

Production plan stations are `面点`, `厨房A组`, `厨房B组`, and `肉加工`. The frontend maps legacy `厨房` plan records to `厨房A组` when loading so existing plans remain visible and can later be reassigned to B group.

Production Helper bootstrap inventory items include their primary `item_type`. The plan editor uses that value to limit main-material suggestions to active raw materials, while recipe auxiliary-material selection remains available across active inventory items.

Key files:

- `backend/app/routers/api/v1/production_helper.py`
- `frontend/src/api/productionHelper.ts`
- `frontend/src/pages/ProductionHelper/*`
- `docs/production_helper_integration.md`

The JSON persistence is acceptable for single-worker deployment. If multi-worker or multi-user concurrent editing becomes important, migrate plans/recipes/status into PostgreSQL.

### LabelMaker

LabelMaker handles product/pack label templates, nutrition values, ingredients, recipes, allergens, FSANZ food data, translation/refinement, HTML labels, and label PDF output.

Key files:

- `backend/app/routers/api/v1/labelmaker.py`
- `backend/app/schemas/labelmaker.py`
- `backend/app/models/labelmaker.py`
- `frontend/src/pages/LabelMakerPage.tsx`
- `frontend/src/api/labelmaker.ts`
- `frontend/src/features/labelmaker/*`

Settings include `OPENAI_API_KEY` and `OPENAI_MODEL` for AI-assisted label work.

## Development Rules For This Repo

- Keep backend endpoints versioned under `/api/v1`.
- Prefer async SQLAlchemy patterns already present.
- Keep request/response schemas explicit in `backend/app/schemas`.
- Keep frontend TypeScript types aligned with Pydantic schemas.
- Do not delete regulated records; use void flows.
- Do not bypass QA lock behavior.
- For core signature forms, keep operator signatures mandatory on create and verifier signatures mandatory on QA lock/verify, while allowing old unsigned records to display.
- Do not add schema only in ORM models. Update `database/init.sql`, add a migration for existing DBs, and consider whether startup idempotent migration is needed.
- For existing database upgrades, do not use `docker compose down -v` unless intentionally destroying data.
- For UI changes, preserve existing React/Tailwind layout and role-guard patterns.
- For bilingual UI, check `frontend/src/i18n/labels.ts` and existing `Bi` usage.
- Before trusting docs, confirm against code.

## Local Skill-Like Usage

This file is the project-local skill reference.

Trigger phrase for future work: "Use the E_HACCP project context."

When triggered:

1. Read `AGENTS.md`.
2. Read this file.
3. Identify the module from the request.
4. Read the matching backend and frontend files listed above.
5. Implement using local patterns.
6. Run the smallest meaningful verification: TypeScript build for frontend changes, backend tests/API checks for backend changes, and Docker logs when deployment/runtime behavior changes.
7. Update this file when new architecture or workflow knowledge is discovered.
