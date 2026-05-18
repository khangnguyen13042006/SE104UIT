#!/usr/bin/env bash
# Quickstart script - chạy backend từ A → Z
# Cách dùng: bash quickstart.sh   (hoặc ./quickstart.sh sau khi chmod +x)

set -e
cd "$(dirname "$0")"

echo "==> Kiểm tra Python..."
python3 --version || { echo "❌ Cần Python 3.10+"; exit 1; }

echo "==> Cài thư viện..."
pip3 install -q -r requirements.txt --break-system-packages 2>/dev/null || pip3 install -q -r requirements.txt

echo "==> Tạo lại database và seed dữ liệu mẫu..."
rm -f san_bong.db
python3 seed.py

echo ""
echo "==> Khởi động backend trên http://localhost:8000"
echo "    Swagger UI: http://localhost:8000/docs"
echo "    Nhấn Ctrl+C để dừng"
echo ""
exec python3 -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
