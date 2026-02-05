-- 测试数据 SQL 脚本
-- 在 Adminer 中执行此脚本来创建测试数据

-- 创建用户（注意：密码哈希是示例，实际应该使用 bcrypt）
-- 密码: "password123" (需要在实际应用中生成正确的哈希)
INSERT INTO users (username, password_hash, role, is_active) 
VALUES 
  ('operator1', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyY5Y5Y5Y5Y5', 'Operator', true),
  ('operator2', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyY5Y5Y5Y5Y5', 'Operator', true),
  ('qa1', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyY5Y5Y5Y5Y5', 'QA', true),
  ('manager1', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyY5Y5Y5Y5Y5', 'Manager', true)
ON CONFLICT (username) DO NOTHING;

-- 创建产品
INSERT INTO products (name, ccp_limit_temp, is_active) 
VALUES 
  ('Pork Dumplings', 90.0, true),
  ('Chicken Dumplings', 90.0, true),
  ('Beef Dumplings', 90.0, true),
  ('Vegetable Dumplings', 90.0, true)
ON CONFLICT DO NOTHING;

-- 查看创建的数据
SELECT 'Users created:' as info;
SELECT id, username, role, is_active FROM users;

SELECT 'Products created:' as info;
SELECT id, name, ccp_limit_temp, is_active FROM products;
