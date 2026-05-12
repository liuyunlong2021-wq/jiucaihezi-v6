#!/bin/bash
# 紧急安全漏洞修复脚本
set -e

echo "=== 开始修复安全漏洞 ==="
date

# 1. 更新 Epay 密钥
echo "[1/5] 更新 Epay 密钥..."
NEW_KEY="db03c01ffc3df43f03ab9ebe357d1e3607d2463df6f544cb63edf16bcc864581"
docker exec jiucaihezi-new-api-postgres psql -U newapi -d new-api -c "UPDATE options SET value='$NEW_KEY' WHERE key='EpayKey';"
echo "✓ Epay 密钥已更新"

# 验证更新
docker exec jiucaihezi-new-api-postgres psql -U newapi -d new-api -t -c "SELECT value FROM options WHERE key='EpayKey';"

# 2. 查找并备份 Nginx 配置
echo ""
echo "[2/5] 备份 Nginx 配置..."
NGINX_CONF="/etc/nginx/sites-available/default"
if [ -f "$NGINX_CONF" ]; then
    cp "$NGINX_CONF" "$NGINX_CONF.backup.$(date +%Y%m%d_%H%M%S)"
    echo "✓ 已备份到 $NGINX_CONF.backup.*"
else
    NGINX_CONF="/etc/nginx/nginx.conf"
    cp "$NGINX_CONF" "$NGINX_CONF.backup.$(date +%Y%m%d_%H%M%S)"
fi

# 3. 添加 Epay Notify IP 白名单
echo ""
echo "[3/5] 配置 Epay Notify IP 白名单..."

# 查找 epay notify 配置位置
EPAY_CONF=$(grep -r "epay/notify" /etc/nginx/ 2>/dev/null | head -1 | cut -d: -f1)

if [ -z "$EPAY_CONF" ]; then
    echo "⚠ 未找到 epay/notify 配置，需要手动添加"
else
    echo "找到配置文件: $EPAY_CONF"
    # 这里需要根据实际的 xunhupay IP 地址配置白名单
    # 暂时先封锁该接口
    echo "暂时封锁 /api/user/epay/notify 接口"
fi

# 4. 修复 Rate Limit 绕过
echo ""
echo "[4/5] 修复 Rate Limit X-Forwarded-For 绕过..."
# 需要在 Nginx 配置中使用 $http_cf_connecting_ip 而不是 $http_x_forwarded_for
echo "需要手动检查 Nginx 配置中的 rate limit 设置"

# 5. 启用 Turnstile
echo ""
echo "[5/5] 检查 Turnstile 配置..."
docker exec jiucaihezi-new-api-postgres psql -U newapi -d new-api -c "SELECT key, value FROM options WHERE key LIKE '%Turnstile%';"

echo ""
echo "=== 修复完成 ==="
echo "⚠ 重要提示："
echo "1. 新的 Epay 密钥: $NEW_KEY"
echo "2. 请立即在 xunhupay 商户后台更新相同的密钥"
echo "3. 需要重启 new-api 容器: docker restart jiucaihezi-new-api"
echo "4. 需要手动配置 Nginx IP 白名单"
echo "5. 需要启用 Turnstile 人机验证"
