#!/usr/bin/env python
"""
Khởi tạo schema database (tạo bảng) — chạy 1 lần khi setup MySQL/SQLite mới.

Usage:
    # SQLite (default):
    python init_db.py

    # MySQL:
    export DATABASE_URL="mysql+pymysql://user:pass@host:port/san_bong"
    python init_db.py

Script này CHỈ tạo bảng (CREATE TABLE IF NOT EXISTS). 
Để seed data demo, chạy `python seed.py` sau đó.
"""
import sys
from app.core.database import engine, get_db_info, Base
# Import tất cả models để Base.metadata biết về chúng
from app.models import (
    User, Field, Booking, BookingService,
    Service, Membership, Invoice, Shift, Feedback
)


def main():
    info = get_db_info()
    print(f"📊 Database type: {info['kind']}")
    if not info['is_sqlite']:
        print(f"   Host: {info['host']}:{info['port']}")
        print(f"   Name: {info['database']}")

    # Verify connection
    try:
        with engine.connect() as conn:
            print("✅ Kết nối database thành công")
    except Exception as e:
        print(f"❌ Không kết nối được database: {e}")
        if info['is_mssql']:
            print("\n💡 Azure SQL / SQL Server checklist:")
            print("   1. ODBC Driver 18 đã cài? https://aka.ms/odbcdriver")
            print("   2. Firewall Azure đã thêm IP của bạn? Portal → SQL Server → Networking")
            print("   3. Connection string format:")
            print("      mssql+pyodbc://USER:PWD@SERVER.database.windows.net:1433/DB?driver=ODBC+Driver+18+for+SQL+Server&Encrypt=yes")
            print("   4. Password URL-encoded? (@→%40, !→%21, #→%23)")
            print("   5. Chạy `python test_azure_connection.py` để debug chi tiết")
        elif info['is_mysql']:
            print("\n💡 MySQL checklist:")
            print("   1. MySQL server đang chạy?")
            print("   2. Database đã được tạo? CREATE DATABASE san_bong CHARACTER SET utf8mb4;")
            print("   3. User/password đúng?")
            print("   4. DATABASE_URL trong .env hoặc env var?")
        sys.exit(1)

    # Create all tables
    print("\n🔨 Tạo tables...")
    Base.metadata.create_all(bind=engine)

    # List tables
    from sqlalchemy import inspect
    insp = inspect(engine)
    tables = insp.get_table_names()
    print(f"✅ Đã tạo {len(tables)} tables:")
    for t in sorted(tables):
        col_count = len(insp.get_columns(t))
        print(f"   • {t} ({col_count} columns)")

    print("\n💡 Bước tiếp theo:")
    print("   python seed.py     # Seed dữ liệu demo")
    print("   uvicorn app.main:app --reload   # Khởi động API")


if __name__ == "__main__":
    main()
