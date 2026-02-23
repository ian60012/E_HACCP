# FD Catering HACCP eQMS System

## 本地 Docker 部署指南

### 前置要求
- Docker Desktop（Windows/Mac）或 Docker Engine（Linux）
- Docker Compose

### 快速启动

#### 1. 检查 Docker 是否运行
```bash
docker --version
docker-compose --version
```

#### 2. 启动所有服务
在项目根目录执行：
```bash
docker-compose up -d
```

这将启动：
- PostgreSQL 数据库（端口 5555）
- FastAPI 后端（端口 8000）
- Vue 3 前端界面（端口 3000）⭐
- Adminer 数据库管理工具（端口 8080）

#### 3. 查看服务状态
```bash
docker-compose ps
```

#### 4. 查看日志
```bash
# 查看所有服务日志
docker-compose logs -f

# 只查看后端日志
docker-compose logs -f backend

# 只查看数据库日志
docker-compose logs -f postgres
```

#### 5. 访问服务
- **前端界面**: http://localhost:3000 ⭐ **主要入口**
- **API 文档（Swagger）**: http://localhost:8000/docs
- **API 根路径**: http://localhost:8000
- **健康检查**: http://localhost:8000/health
- **Adminer（数据库管理）**: http://localhost:8080

### Adminer 登录信息
访问 http://localhost:8080 后：
- **系统**: PostgreSQL
- **服务器**: postgres
- **用户名**: haccp_user
- **密码**: haccp_password
- **数据库**: haccp_db

### 停止服务
```bash
# 停止服务（保留数据）
docker-compose stop

# 停止并删除容器（保留数据卷）
docker-compose down

# 停止并删除容器和数据卷（⚠️ 会删除所有数据）
docker-compose down -v
```

### 重新构建
如果修改了代码或 Dockerfile：
```bash
docker-compose up -d --build
```

### 环境变量（可选）
如果需要自定义配置，可以在项目根目录创建 `.env` 文件：
```env
POSTGRES_USER=your_user
POSTGRES_PASSWORD=your_password
POSTGRES_DB=your_db_name
```

### 使用系统
1. **访问前端界面**: http://localhost:3000
   - 这是主要的用户界面
   - 可以创建和查看烹饪日志
   - 实时验证 CCP（核心温度限制）

2. **测试 API**: http://localhost:8000/docs
   - 使用交互式 API 文档测试端点

### 常见问题

**端口被占用？**
- 修改 `docker-compose.yml` 中的端口映射（例如：`"8001:8000"`）

**后端无法连接数据库？**
- 确保 PostgreSQL 容器已完全启动（使用 `docker-compose ps` 检查）
- 检查后端日志：`docker-compose logs backend`

**需要重置数据库？**
```bash
docker-compose down -v
docker-compose up -d
```
