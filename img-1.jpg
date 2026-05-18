#!/usr/bin/env python
"""
Test connection tới Azure SQL Database.

Usage:
    # Set env var:
    export DATABASE_URL="mssql+pyodbc://user:pass@server.database.windows.net:1433/db?driver=ODBC+Driver+18+for+SQL+Server&Encrypt=yes"

    python test_azure_connection.py
"""
import sys
from sqlalchemy import text
from app.core.database import engine, get_db_info


def main():
    info = get_db_info()
    print(f"📊 Database type: {info['kind']}")
    print(f"   Driver:   {info['driver']}")
    print(f"   Host:     {info['host']}")
    print(f"   Port:     {info['port']}")
    print(f"   Database: {info['database']}\n")

    if not info['is_mssql']:
        print("⚠️  DATABASE_URL không phải Azure SQL / SQL Server.")
        print("   Script này dùng để test Azure SQL connection.")
        return

    try:
        print("🔌 Đang kết nối...")
        with engine.connect() as conn:
            # Test query: server version + current user
            result = conn.execute(text("SELECT @@VERSION AS version, SYSTEM_USER AS current_user_name, DB_NAME() AS database_name"))
            row = result.fetchone()
            print("✅ Kết nối thành công!\n")
            print(f"   Server version:")
            for line in row.version.split("\n")[:3]:
                print(f"      {line.strip()}")
            print(f"   Connected as: {row.current_user_name}")
            print(f"   Database:     {row.database_name}")

            # Check tables
            tbls = conn.execute(text("""
                SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES 
                WHERE TABLE_TYPE = 'BASE TABLE' AND TABLE_SCHEMA = 'dbo'
                ORDER BY TABLE_NAME
            """)).fetchall()
            print(f"\n   Tables hiện có: {len(tbls)}")
            for t in tbls:
                print(f"      • {t.TABLE_NAME}")
            if not tbls:
                print("      (chưa có table → chạy `python init_db.py` để tạo)")

    except Exception as e:
        msg = str(e)
        print(f"❌ LỖI: {msg[:400]}\n")
        print("💡 Kiểm tra các điểm sau:")
        print("   1. ODBC Driver 18 đã cài? (https://aka.ms/odbcdriver)")
        if "Login failed" in msg:
            print("   2. Username/password đúng? Password có encode URL chưa? (@→%40, !→%21)")
        if "TCP Provider" in msg or "timeout" in msg.lower():
            print("   2. Firewall Azure SQL có cho IP của bạn? Vào Portal → SQL Server → Networking → Add client IP")
        if "Cannot open server" in msg:
            print("   2. Server name đúng? Format: <server>.database.windows.net")
        if "Encrypt" in msg:
            print("   2. Đảm bảo có `?driver=ODBC+Driver+18+for+SQL+Server&Encrypt=yes` trong URL")
        print("   3. Connection string format đúng:")
        print("      mssql+pyodbc://USER:PASSWORD@SERVER.database.windows.net:1433/DB"
              "?driver=ODBC+Driver+18+for+SQL+Server&Encrypt=yes&TrustServerCertificate=no")
        sys.exit(1)


if __name__ == "__main__":
    main()
