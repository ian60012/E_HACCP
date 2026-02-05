# 测试指南

## 1. 验证服务是否运行

### 检查容器状态
```bash
docker compose ps
```

应该看到三个容器都在运行：
- `haccp_postgres` (数据库)
- `haccp_backend` (API 后端)
- `haccp_adminer` (数据库管理工具)

### 检查服务健康状态
在浏览器访问：
- **健康检查**: http://localhost:8000/health
- **API 根路径**: http://localhost:8000
- **API 文档**: http://localhost:8000/docs

## 2. 使用 Swagger UI 测试 API

### 访问 API 文档
打开浏览器访问：**http://localhost:8000/docs**

这是交互式 API 文档，可以直接测试所有端点。

## 3. 测试步骤

### 步骤 1: 创建测试数据（通过 Adminer）

#### 访问 Adminer
1. 打开 http://localhost:8080
2. 登录信息：
   - **系统**: PostgreSQL
   - **服务器**: postgres
   - **用户名**: haccp_user
   - **密码**: haccp_password
   - **数据库**: haccp_db

#### 创建用户（User）
在 SQL 查询中执行：
```sql
INSERT INTO users (username, password_hash, role, is_active) 
VALUES 
  ('operator1', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyY5Y5Y5Y5Y5', 'Operator', true),
  ('qa1', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyY5Y5Y5Y5Y5', 'QA', true),
  ('manager1', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyY5Y5Y5Y5Y5', 'Manager', true);
```

**注意**: 上面的密码哈希是示例，实际应该使用 bcrypt 生成。或者先创建用户，稍后添加认证功能。

#### 创建产品（Product）
```sql
INSERT INTO products (name, ccp_limit_temp, is_active) 
VALUES 
  ('Pork Dumplings', 90.0, true),
  ('Chicken Dumplings', 90.0, true),
  ('Beef Dumplings', 90.0, true);
```

### 步骤 2: 测试 Cooking Log API

#### 测试用例 1: 通过测试（温度 >= 90°C）

在 Swagger UI (http://localhost:8000/docs) 中：

1. 找到 `POST /api/v1/cooking-logs`
2. 点击 "Try it out"
3. 输入以下 JSON（**PASS 案例**）：
```json
{
  "batch_no": "BATCH-001",
  "product_id": 1,
  "operator_id": 1,
  "start_time": "2024-01-15T10:00:00",
  "end_time": "2024-01-15T11:30:00",
  "core_temp": 92.5
}
```
4. 点击 "Execute"
5. **预期结果**: 
   - 状态码: 201 Created
   - `status`: "PASS"
   - `requires_deviation`: false

#### 测试用例 2: 失败测试（温度 < 90°C）

使用相同的端点，输入以下 JSON（**FAIL 案例**）：
```json
{
  "batch_no": "BATCH-002",
  "product_id": 1,
  "operator_id": 1,
  "start_time": "2024-01-15T12:00:00",
  "end_time": "2024-01-15T13:30:00",
  "core_temp": 85.0
}
```

**预期结果**:
- 状态码: 201 Created
- `status`: "FAIL"
- 应该触发偏差记录（Deviation Record）

#### 测试用例 3: 边界测试（正好 90°C）

```json
{
  "batch_no": "BATCH-003",
  "product_id": 1,
  "operator_id": 1,
  "start_time": "2024-01-15T14:00:00",
  "end_time": "2024-01-15T15:30:00",
  "core_temp": 90.0
}
```

**预期结果**: `status`: "PASS" (>= 90°C 应该通过)

### 步骤 3: 查询 Cooking Logs

#### 获取所有日志
1. 找到 `GET /api/v1/cooking-logs`
2. 点击 "Try it out"
3. 可选参数：
   - `skip`: 0 (跳过记录数)
   - `limit`: 100 (返回记录数)
4. 点击 "Execute"
5. **预期结果**: 返回所有创建的日志列表

#### 获取单个日志
1. 找到 `GET /api/v1/cooking-logs/{log_id}`
2. 输入 `log_id`: 1
3. 点击 "Execute"
4. **预期结果**: 返回 ID 为 1 的日志详情

### 步骤 4: 错误处理测试

#### 测试不存在的产品
```json
{
  "batch_no": "BATCH-999",
  "product_id": 999,
  "operator_id": 1,
  "start_time": "2024-01-15T10:00:00",
  "end_time": "2024-01-15T11:30:00",
  "core_temp": 92.5
}
```

**预期结果**: 404 Not Found - "Product with ID 999 not found"

#### 测试重复的批次号
使用已存在的 `batch_no`（如 "BATCH-001"）创建新日志

**预期结果**: 数据库约束错误（批次号必须唯一）

## 4. 使用 curl 测试（命令行）

### 健康检查
```bash
curl http://localhost:8000/health
```

### 创建 Cooking Log (PASS)
```bash
curl -X POST "http://localhost:8000/api/v1/cooking-logs" \
  -H "Content-Type: application/json" \
  -d "{
    \"batch_no\": \"BATCH-CURL-001\",
    \"product_id\": 1,
    \"operator_id\": 1,
    \"start_time\": \"2024-01-15T10:00:00\",
    \"end_time\": \"2024-01-15T11:30:00\",
    \"core_temp\": 95.0
  }"
```

### 创建 Cooking Log (FAIL)
```bash
curl -X POST "http://localhost:8000/api/v1/cooking-logs" \
  -H "Content-Type: application/json" \
  -d "{
    \"batch_no\": \"BATCH-CURL-002\",
    \"product_id\": 1,
    \"operator_id\": 1,
    \"start_time\": \"2024-01-15T12:00:00\",
    \"end_time\": \"2024-01-15T13:30:00\",
    \"core_temp\": 88.0
  }"
```

### 获取所有日志
```bash
curl http://localhost:8000/api/v1/cooking-logs
```

## 5. 验证 CCP 逻辑

### 关键测试点

1. **温度 >= 90°C** → 应该返回 `PASS`
2. **温度 < 90°C** → 应该返回 `FAIL` 并标记需要偏差记录
3. **温度 = 90.0°C** → 应该返回 `PASS`（边界值）

### 验证数据库记录

在 Adminer 中查询：
```sql
SELECT 
  id, 
  batch_no, 
  core_temp, 
  status, 
  created_at 
FROM cooking_logs 
ORDER BY created_at DESC;
```

确认：
- `status` 字段正确（PASS 或 FAIL）
- 温度值正确记录
- 时间戳正确

## 6. 查看日志

### 查看后端日志
```bash
docker compose logs -f backend
```

### 查看数据库日志
```bash
docker compose logs -f postgres
```

## 7. 常见问题排查

### 问题：无法连接到数据库
- 检查 PostgreSQL 容器是否运行：`docker compose ps`
- 查看数据库日志：`docker compose logs postgres`

### 问题：API 返回 500 错误
- 查看后端日志：`docker compose logs backend`
- 检查数据库连接配置

### 问题：找不到产品/用户
- 确保已通过 Adminer 创建测试数据
- 检查 ID 是否正确

## 8. 下一步测试

完成基础测试后，可以测试：
- [ ] 冷却日志（Cooling Log）功能
- [ ] 偏差记录（Deviation Record）功能
- [ ] 用户认证和授权
- [ ] 数据验证和错误处理
