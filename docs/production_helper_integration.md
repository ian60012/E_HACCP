# Production Helper 整合紀錄 / Integration Notes

> **Branch**：`dev`（commits `11a28bc` → `93dccd3` → `31035c1`）
> **日期**：2026-05-04 / 2026-05-05
> **狀態**：已合併進 `dev`，等待併入 `main` 部署

---

## 1. 背景 / Context

`D:\production_helper`（Python stdlib HTTP server + vanilla JS）原本是獨立部署的食品週生產計畫工具，會打**外部 eQMS**（`http://192.168.110.34:3001`）抓產品/批次/原料快取到 JSON。

要整合進 E_HACCP（FastAPI + React + PostgreSQL HACCP eQMS）。**E_HACCP 本身就是 eQMS**，因此整合後不再打外部 IP，改成直接從 E_HACCP 的 `prod_products` / `prod_batches` / `inv_items` 資料表讀取。

---

## 2. 架構決策 / Design Decisions

| 議題 | 決定 |
|---|---|
| Backend 整合方式 | 把 `app.py` 的 BaseHTTPRequestHandler 邏輯轉成 FastAPI router 掛在 `/api/v1/production-helper/*` |
| 資料源 | products / batches / inventory **直接查 PostgreSQL**（移除 `EqmsClient`、移除 cache JSON、移除 `/sync` endpoints） |
| Plans / Recipes / Purchase status | 仍以 JSON 檔保存（`PRODUCTION_HELPER_DATA_DIR`），單純、改動小 |
| 權限 | 新增 `Captain` 角色，是**超級角色**（access 所有模塊，>= Admin） |
| Production Helper 入口 | **僅 Captain 可存取**（`require_role("Captain")` 仍只放行 Captain） |
| 前端 | 完全改寫成 React + Tailwind，融入既有 RoleGuard / Sidebar |
| Sidebar | `/production-helper` 是**獨立系統**（不混在 HACCP），detectSystem 回傳 `'production-helper'` |
| Sub-routes | `/production-helper`（看板）、`/recipes`（抽屜）、`/requirements`（抽屜）— 都 render `ProductionHelperPage`，由 `useLocation` 決定哪個抽屜開 |
| 雙語 | 全部 UI 用 `Bi`/`bi`（`i18n/labels.ts` 加 ~80 個 `ph.*` keys） |
| 材料選擇 | `main_material_name` 用 `<datalist>` combobox，下拉選項來自 `inv_items` |
| 部署方式 | 走 `D:\e_haccp\docker-compose.yml`，新增 `production_helper_data` named volume |

---

## 3. 變更檔案 / Changed Files

### Backend
| 動作 | 檔案 |
|---|---|
| 新增 | `backend/app/routers/api/v1/production_helper.py` |
| 新增 | `backend/app/data/production_helper/.gitkeep` |
| 編輯 | `backend/app/main.py` — include router + lifespan `init_data_dir()` |
| 編輯 | `backend/app/core/config.py` — `PRODUCTION_HELPER_DATA_DIR` 設定 |
| 編輯 | `backend/app/models/enums.py` — `UserRole` 加 `CAPTAIN = "Captain"` |
| 編輯 | `backend/app/dependencies/auth.py` — `require_role` 短路放行 Captain |

### Database
| 動作 | 檔案 |
|---|---|
| 新增 | `database/migrations/20260504_add_captain_role.sql` |
| 編輯 | `database/init.sql` — `CREATE TYPE user_role_enum` 加 `'Captain'` |

### Frontend
| 動作 | 檔案 |
|---|---|
| 新增 | `frontend/src/api/productionHelper.ts` |
| 新增 | `frontend/src/pages/ProductionHelper/`（11 個檔）：`ProductionHelperPage.tsx`、`WeeklyBoard.tsx`、`PlanCard.tsx`、`NoteCard.tsx`、`Drawer.tsx`、`PlanDrawer.tsx`、`NoteDrawer.tsx`、`RecipeDrawer.tsx`、`RequirementsDrawer.tsx`、`useProductionHelper.ts`、`utils.ts` |
| 編輯 | `frontend/src/App.tsx` — 三個 `/production-helper*` 路由 + RoleGuard |
| 編輯 | `frontend/src/components/Sidebar.tsx` — 新增 `productionHelperSections`、`detectSystem` 回 `'production-helper'`，Captain 全 section 通過 |
| 編輯 | `frontend/src/components/RoleGuard.tsx` — Captain 自動放行 |
| 編輯 | `frontend/src/components/RoleGate.tsx` — Captain 自動放行 |
| 編輯 | `frontend/src/components/NavBar.tsx` — Captain badge（玫瑰紅）+ label key |
| 編輯 | `frontend/src/hooks/usePermissions.ts` — `hasRole` 對 Captain 永遠 true |
| 編輯 | `frontend/src/types/auth.ts` — `User.role` 加 `'Captain'` |
| 編輯 | `frontend/src/pages/PortalPage.tsx` — 新增 Captain-only 系統卡 |
| 編輯 | `frontend/src/pages/users/UsersPage.tsx` — 角色下拉加 Captain |
| 編輯 | `frontend/src/pages/inventory/InventoryStocktakePage.tsx` — `canEdit` 接受 Captain |
| 編輯 | `frontend/src/i18n/labels.ts` — 加 `role.captain` + `ph.*` 共 80+ key |

### Infra
| 動作 | 檔案 |
|---|---|
| 編輯 | `docker-compose.yml` — `PRODUCTION_HELPER_DATA_DIR` env、`production_helper_data` named volume |
| 新增 | `.gitignore`（runtime JSON 排除：`backend/app/data/production_helper/*.json`） |

---

## 4. API 路由表 / API Routes

全部前綴 `/api/v1/production-helper`，全部 `Depends(require_role("Captain"))`：

| Method | Path | 來源 |
|---|---|---|
| GET | `/health` | – |
| GET | `/bootstrap` | DB（products/batches/inv_items）+ JSON（plans/recipes/purchase_status） |
| GET | `/plans?week=` | JSON `plans.json` |
| POST | `/plans` | JSON |
| PUT | `/plans/{id}` | JSON |
| DELETE | `/plans/{id}` | JSON |
| GET | `/recipes` | JSON `recipes.json` |
| POST | `/recipes` | JSON |
| PUT | `/recipes/{id}` | JSON |
| DELETE | `/recipes/{id}` | JSON |
| GET | `/purchase-status` | JSON `purchase_status.json` |
| POST | `/purchase-status` | JSON |
| GET | `/purchase-requirements?week=` | 計算（plans × recipes） |
| GET | `/purchase-requirements.csv` | CSV + UTF-8 BOM |

---

## 5. 部署流程：dev → main + Docker

### 情境 A：全新部署（沒有舊 DB）
無需任何 migration。`init.sql` 在 PostgreSQL 第一次建立資料庫時跑，已含 `'Captain'`。

```powershell
git checkout main
git merge --no-ff dev -m "merge: production_helper integration"
git push origin main

cd D:\e_haccp
docker compose up --build -d
# 完成
```

### 情境 B：既有 DB 升級 ⭐ 通常是這個

```powershell
# 1) 合併 + 推 main
cd D:\e_haccp
git checkout main
git pull --ff-only origin main
git merge --no-ff dev -m "merge: production_helper integration"
git push origin main

# 2) 重建容器（保留 volumes，不要加 -v）
docker compose down
docker compose up --build -d

# 3) 套用 Captain 角色 migration（init.sql 不會重跑）
docker exec -i haccp_postgres psql -U haccp_user -d haccp_db -p 5555 `
  < database/migrations/20260504_add_captain_role.sql
# 預期：NOTICE enum label "Captain" already exists, skipping  或  ALTER TYPE

# 4) 建立或升級 Captain 帳號（見下節）
```

### ⚠️ 不要做的事
| ❌ | 原因 |
|---|---|
| `docker compose down -v` | 會清空 `postgres_data` 與 `production_helper_data`，所有資料消失 |
| 手動跑 `init.sql` | 會撞到已存在物件 |
| 新建 production_helper 專屬 table | 沒有需要 — JSON 檔走 named volume 持久化 |

---

## 6. Captain 帳號管理

### 升級既有使用者
```sql
docker exec -it haccp_postgres psql -U haccp_user -d haccp_db -p 5555 -c `
  "UPDATE users SET role='Captain' WHERE username='admin1';"
```

### 新增 Captain 帳號（密碼複製自 admin1，預設 password123）
```sql
docker exec -it haccp_postgres psql -U haccp_user -d haccp_db -p 5555 -c `
  "INSERT INTO users (username, full_name, password_hash, role, is_active) \
   VALUES ('captain', '船長', \
   (SELECT password_hash FROM users WHERE username='admin1'), 'Captain', true) \
   ON CONFLICT (username) DO UPDATE SET role='Captain', is_active=true;"
```

### 用 UI 新增
以 Admin 角色登入 → `/users` → 新增使用者 → 角色選「船長 Captain」。

---

## 7. 驗證 / Verification

### DB
```powershell
# Captain 角色已加進 enum
docker exec -it haccp_postgres psql -U haccp_user -d haccp_db -p 5555 -c `
  "SELECT enumlabel FROM pg_enum WHERE enumtypid = 'user_role_enum'::regtype ORDER BY enumsortorder;"
# 預期：Admin / QA / Production / Warehouse / Captain

# Captain 帳號存在
docker exec -it haccp_postgres psql -U haccp_user -d haccp_db -p 5555 -c `
  "SELECT username, role FROM users WHERE role='Captain';"
```

### API
```powershell
# 取得 token
curl -X POST http://localhost:8000/api/v1/auth/login `
  -d "username=captain1&password=password123" `
  -H "Content-Type: application/x-www-form-urlencoded"

# 用 Captain token 打 bootstrap，預期 200
curl -H "Authorization: Bearer <CAPTAIN_TOKEN>" `
  http://localhost:8000/api/v1/production-helper/bootstrap

# 用 Production token，預期 403
curl -H "Authorization: Bearer <PRODUCTION_TOKEN>" `
  http://localhost:8000/api/v1/production-helper/plans
# {"detail":"Role 'Production' not authorized. Required: Captain"}

# Captain 也可以打 admin-only endpoint
curl -H "Authorization: Bearer <CAPTAIN_TOKEN>" `
  http://localhost:8000/api/v1/admin/activity
# 200
```

### Frontend
1. http://localhost:3000 登入 Captain
2. 看到 Portal 上有 4 個系統卡，包含「生產輔助 Production Helper」（玫瑰紅色）
3. 點進去後 Sidebar 是**獨立的** Production Helper sidebar：週生產計畫 / 配方庫 / 叫貨總覽
4. 表單欄位是中英雙語：「主材料 Main Material」、「主材料 kg Main Qty (kg)」等
5. 主材料欄輸入時下拉顯示 `inv_items` 內容（combobox）

### TypeScript
```powershell
docker exec haccp_frontend sh -c "cd /app && npx tsc --noEmit"
# exit 0
```

---

## 8. Volume 與資料持久化

| Volume | 內容 | 重啟容器後 |
|---|---|---|
| `e_haccp_postgres_data` | PostgreSQL 全部資料 | 保留 |
| `e_haccp_production_helper_data` | `plans.json` / `recipes.json` / `purchase_status.json` | 保留 |

JSON 檔寫入用 atomic `tmp.replace(path)` pattern。**單一 worker uvicorn** 環境安全；多 worker 必須遷移到 Postgres（v2 工作）。

---

## 9. 移除的元件

整合過程中**移除**的元件（不再需要）：
- `EqmsClient` class（外部 HTTP eQMS 整合）
- `sync_eqms_resource` 函數
- `/api/sync` / `/api/sync/{resource}` endpoints
- `products_cache.json` / `recent_batches_cache.json` / `inventory_items_cache.json`
- `EQMS_BASE_URL` / `EQMS_USERNAME` / `EQMS_PASSWORD` 環境變數
- 前端「同步 eQMS」按鈕（改名「重新整理」，重打 `/bootstrap`）

`D:\production_helper\` 原始目錄保留作為歸檔，未刪除。

---

## 10. 未來工作 / Future Work

| 項目 | 何時做 |
|---|---|
| 把 plans/recipes/purchase_status 從 JSON 遷移到 PostgreSQL | 需要多 worker 部署或多人並發編輯時 |
| Plan / Recipe 加 `main_material_id` 外鍵到 `inv_items` | 想做主料庫存連動時 |
| 配方版本控制（recipe history） | QA 需要追溯時 |
| 把 production_helper 與 batch_sheet 串接（從計畫一鍵建批次） | 流程整合時 |
| 加上 i18n 切換英文 UI 的開關（目前永遠中英混排） | 有英文使用者時 |

---

## 11. 關鍵連結

- **Repo**：https://github.com/ian60012/E_HACCP
- **Dev branch**：https://github.com/ian60012/E_HACCP/tree/dev
- **原始 production_helper**：`D:\production_helper\`（保留歸檔）
- **計畫檔**：`C:\Users\ianht\.claude\plans\https-github-com-ian60012-e-haccp-d-pro-hazy-tulip.md`
