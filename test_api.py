"""
简单的 API 测试脚本
使用方法: python test_api.py
"""

import requests
import json
from datetime import datetime, timedelta

BASE_URL = "http://localhost:8000"

def test_health_check():
    """测试健康检查端点"""
    print("\n=== 测试健康检查 ===")
    try:
        response = requests.get(f"{BASE_URL}/health")
        print(f"状态码: {response.status_code}")
        print(f"响应: {response.json()}")
        return response.status_code == 200
    except Exception as e:
        print(f"错误: {e}")
        return False

def test_create_cooking_log_pass():
    """测试创建通过 CCP 验证的烹饪日志"""
    print("\n=== 测试创建烹饪日志 (PASS - 温度 >= 90°C) ===")
    
    data = {
        "batch_no": f"BATCH-TEST-{datetime.now().strftime('%Y%m%d%H%M%S')}",
        "product_id": 1,
        "operator_id": 1,
        "start_time": datetime.now().isoformat(),
        "end_time": (datetime.now() + timedelta(hours=1, minutes=30)).isoformat(),
        "core_temp": 95.0  # 高于 90°C，应该通过
    }
    
    try:
        response = requests.post(
            f"{BASE_URL}/api/v1/cooking-logs",
            json=data,
            headers={"Content-Type": "application/json"}
        )
        print(f"状态码: {response.status_code}")
        result = response.json()
        print(f"响应: {json.dumps(result, indent=2, ensure_ascii=False)}")
        
        if response.status_code == 201:
            print(f"✅ 测试通过: 状态 = {result.get('status')}")
            return result.get('id')
        else:
            print(f"❌ 测试失败")
            return None
    except Exception as e:
        print(f"错误: {e}")
        return None

def test_create_cooking_log_fail():
    """测试创建未通过 CCP 验证的烹饪日志"""
    print("\n=== 测试创建烹饪日志 (FAIL - 温度 < 90°C) ===")
    
    data = {
        "batch_no": f"BATCH-TEST-FAIL-{datetime.now().strftime('%Y%m%d%H%M%S')}",
        "product_id": 1,
        "operator_id": 1,
        "start_time": datetime.now().isoformat(),
        "end_time": (datetime.now() + timedelta(hours=1, minutes=30)).isoformat(),
        "core_temp": 85.0  # 低于 90°C，应该失败
    }
    
    try:
        response = requests.post(
            f"{BASE_URL}/api/v1/cooking-logs",
            json=data,
            headers={"Content-Type": "application/json"}
        )
        print(f"状态码: {response.status_code}")
        result = response.json()
        print(f"响应: {json.dumps(result, indent=2, ensure_ascii=False)}")
        
        if response.status_code == 201:
            status = result.get('status')
            if status == "FAIL":
                print(f"✅ 测试通过: 正确识别为 FAIL (温度 {data['core_temp']}°C < 90°C)")
            else:
                print(f"❌ 测试失败: 应该返回 FAIL，但返回了 {status}")
            return result.get('id')
        else:
            print(f"❌ 测试失败")
            return None
    except Exception as e:
        print(f"错误: {e}")
        return None

def test_get_cooking_logs():
    """测试获取所有烹饪日志"""
    print("\n=== 测试获取所有烹饪日志 ===")
    try:
        response = requests.get(f"{BASE_URL}/api/v1/cooking-logs")
        print(f"状态码: {response.status_code}")
        logs = response.json()
        print(f"返回日志数量: {len(logs)}")
        if logs:
            print(f"最新日志: {json.dumps(logs[0], indent=2, ensure_ascii=False, default=str)}")
        return response.status_code == 200
    except Exception as e:
        print(f"错误: {e}")
        return False

def test_get_cooking_log(log_id):
    """测试获取单个烹饪日志"""
    print(f"\n=== 测试获取烹饪日志 ID={log_id} ===")
    try:
        response = requests.get(f"{BASE_URL}/api/v1/cooking-logs/{log_id}")
        print(f"状态码: {response.status_code}")
        if response.status_code == 200:
            result = response.json()
            print(f"响应: {json.dumps(result, indent=2, ensure_ascii=False, default=str)}")
            print(f"✅ 测试通过")
            return True
        else:
            print(f"响应: {response.text}")
            return False
    except Exception as e:
        print(f"错误: {e}")
        return False

def test_boundary_case():
    """测试边界情况（正好 90°C）"""
    print("\n=== 测试边界情况 (温度 = 90.0°C) ===")
    
    data = {
        "batch_no": f"BATCH-BOUNDARY-{datetime.now().strftime('%Y%m%d%H%M%S')}",
        "product_id": 1,
        "operator_id": 1,
        "start_time": datetime.now().isoformat(),
        "end_time": (datetime.now() + timedelta(hours=1, minutes=30)).isoformat(),
        "core_temp": 90.0  # 正好 90°C，应该通过
    }
    
    try:
        response = requests.post(
            f"{BASE_URL}/api/v1/cooking-logs",
            json=data,
            headers={"Content-Type": "application/json"}
        )
        print(f"状态码: {response.status_code}")
        result = response.json()
        print(f"响应: {json.dumps(result, indent=2, ensure_ascii=False)}")
        
        if response.status_code == 201:
            status = result.get('status')
            if status == "PASS":
                print(f"✅ 测试通过: 边界值 90.0°C 正确识别为 PASS")
            else:
                print(f"❌ 测试失败: 90.0°C 应该返回 PASS，但返回了 {status}")
            return True
        else:
            print(f"❌ 测试失败")
            return False
    except Exception as e:
        print(f"错误: {e}")
        return False

def main():
    """运行所有测试"""
    print("=" * 60)
    print("FD Catering HACCP eQMS API 测试")
    print("=" * 60)
    
    # 检查服务是否运行
    if not test_health_check():
        print("\n❌ 服务未运行或无法访问！")
        print("请确保 Docker 容器正在运行:")
        print("  docker compose up -d")
        return
    
    # 运行测试
    log_id = test_create_cooking_log_pass()
    test_create_cooking_log_fail()
    test_boundary_case()
    test_get_cooking_logs()
    
    if log_id:
        test_get_cooking_log(log_id)
    
    print("\n" + "=" * 60)
    print("测试完成！")
    print("=" * 60)
    print("\n提示:")
    print("- 访问 http://localhost:8000/docs 查看完整 API 文档")
    print("- 访问 http://localhost:8080 使用 Adminer 查看数据库")

if __name__ == "__main__":
    main()
