#!/bin/bash
set -e

echo "=== 安全漏洞紧急修复脚本 ==="
echo "开始时间: $(date)"
echo ""

# 1. 查找配置文件
echo "[1/6] 查找 new-api 配置文件..."
CONFIG_LOCATIONS=(
    "/root/new-api-new"
    "/app"
    "/opt/new-api"
    "/var/www/new-api"
    "/home"
)

for loc in "${CONFIG_LOCATIONS[@]}"; do
    if [ -d "$loc" ]; then
        echo "检查目录: $loc"
        find "$loc" -name "*.env" -o -name "config.json" -o -name "*.yaml" 2>/dev/null | head -10
    fi
done

# 查找 docker-compose 文件
echo ""
echo "查找 docker-compose 配置..."
find / -name "docker-compose.yml" -o -name "docker-compose.yaml" 2>/dev/null | grep -v "/proc" | head -10

# 2. 生成强随机密钥
echo ""
echo "[2/6] 生成新的 Epay 密钥..."
NEW_EPAY_KEY=$(openssl rand -hex 32)
echo "新密钥已生成: $NEW_EPAY_KEY"
echo "$NEW_EPAY_KEY" > /tmp/new_epay_key.txt

# 3. 查找 nginx 配置
echo ""
echo "[3/6] 查找 Nginx 配置文件..."
NGINX_CONFIGS=$(find /etc/nginx -name "*.conf" 2>/dev/null)
echo "$NGINX_CONFIGS"

# 4. 检查当前 epay notify 配置
echo ""
echo "[4/6] 检查当前 epay notify 路由..."
grep -r "epay/notify" /etc/nginx/ 2>/dev/null || echo "未找到 epay notify 配置"

# 5. 查找 new-api 进程和配置
echo ""
echo "[5/6] 检查 new-api 进程..."
ps aux | grep new-api | grep -v grep

# 6. 检查 Docker 容器
echo ""
echo "[6/6] 检查 Docker 容器..."
docker ps -a 2>/dev/null || echo "Docker 未运行或未安装"

echo ""
echo "=== 检查完成 ==="
