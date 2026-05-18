"""
Database configuration. Hỗ trợ 3 loại database:

1) SQLite (default, dễ dev):
    Không cần làm gì, tự động dùng san_bong.db

2) MySQL:
    DATABASE_URL=mysql+pymysql://user:password@host:port/san_bong

3) Azure SQL Database / SQL Server:
    DATABASE_URL=mssql+pymssql://user:password@server.database.windows.net:1433/san_bong
"""
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv

load_dotenv()

SQLALCHEMY_DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "sqlite:///./san_bong.db"
)

is_sqlite = SQLALCHEMY_DATABASE_URL.startswith("sqlite")
is_mssql = SQLALCHEMY_DATABASE_URL.startswith("mssql")
is_mysql = SQLALCHEMY_DATABASE_URL.startswith("mysql")

engine_kwargs = {
    "echo": os.getenv("SQL_ECHO", "false").lower() == "true",
}

if is_sqlite:
    engine_kwargs["connect_args"] = {"check_same_thread": False}
elif is_mssql:
    # Azure SQL / SQL Server: cấu hình pool và timeouts
    engine_kwargs.update({
        "pool_pre_ping": True,
        "pool_recycle": 1800,      # Azure idle timeout ~30 min, recycle trước đó
        "pool_size": 5,
        "max_overflow": 10,
        # ĐÃ XÓA fast_executemany VÌ PYMSSQL KHÔNG HỖ TRỢ
    })
else:
    # MySQL
    engine_kwargs.update({
        "pool_pre_ping": True,
        "pool_recycle": 3600,
        "pool_size": 10,
        "max_overflow": 20,
    })

engine = create_engine(SQLALCHEMY_DATABASE_URL, **engine_kwargs)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_db_info() -> dict:
    """Debug helper: thông tin database hiện tại."""
    url = engine.url
    if is_sqlite:
        kind = "SQLite"
    elif is_mssql:
        kind = "Azure SQL / SQL Server"
    else:
        kind = "MySQL"
    return {
        "kind": kind,
        "driver": url.drivername,
        "database": url.database,
        "host": url.host,
        "port": url.port,
        "is_sqlite": is_sqlite,
        "is_mssql": is_mssql,
        "is_mysql": is_mysql,
    }
