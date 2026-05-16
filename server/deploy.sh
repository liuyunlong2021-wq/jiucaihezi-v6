#!/bin/bash
# 韭菜盒子 Office & Graphify 后端 — 部署脚本
# 用法: bash deploy.sh
set -e

SERVER="root@47.82.86.196"
PASS="Wld8199181@"
SSH="sshpass -p '$PASS' ssh -o StrictHostKeyChecking=no $SERVER"
SCP="sshpass -p '$PASS' scp -o StrictHostKeyChecking=no"

echo "=== 1. 安装系统依赖 ==="
eval $SSH 'apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq libreoffice poppler-utils tesseract-ocr qpdf pandoc'

echo "=== 2. 安装 Python 依赖 ==="
eval $SSH 'pip3 install fastapi uvicorn python-multipart pypdf pdfplumber reportlab python-docx openpyxl pandas pillow markitdown networkx 2>&1 | tail -5'

echo "=== 3. 安装 Node 依赖 ==="
eval $SSH 'npm install -g pptxgenjs 2>&1 | tail -3'

echo "=== 4. 创建目录 ==="
eval $SSH 'mkdir -p /opt/jiucaihezi/{uploads,output,scripts}'

echo "=== 5. 上传服务代码 ==="
eval $SCP "$(dirname "$0")/main.py" "$SERVER:/opt/jiucaihezi/main.py"
eval $SCP "$(dirname "$0")/requirements.txt" "$SERVER:/opt/jiucaihezi/requirements.txt"

echo "=== 6. 安装 systemd 服务 ==="
eval $SCP "$(dirname "$0")/jiucaihezi.service" "$SERVER:/etc/systemd/system/jiucaihezi-office.service"
eval $SSH 'systemctl daemon-reload && systemctl enable jiucaihezi-office && systemctl restart jiucaihezi-office'

echo "=== 7. 配置 Nginx 反向代理 ==="
eval $SSH 'cat > /etc/nginx/sites-available/jiucaihezi-office << "NGINX"
server {
    listen 8090;
    server_name _;
    client_max_body_size 100M;

    location /api/ {
        proxy_pass http://127.0.0.1:8090;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_read_timeout 300s;
    }
}
NGINX
ln -sf /etc/nginx/sites-available/jiucaihezi-office /etc/nginx/sites-enabled/ 2>/dev/null
nginx -t && systemctl reload nginx'

echo "=== 8. 验证 ==="
sleep 3
eval $SSH 'systemctl status jiucaihezi-office --no-pager | head -10'
eval $SSH 'curl -s http://localhost:8090/api/health | python3 -m json.tool 2>/dev/null || echo "Service starting..."'

echo "=== 部署完成 ==="
