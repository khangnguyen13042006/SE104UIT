"""
Database configuration. Hỗ trợ 3 loại database:

1) SQLite (default, dễ dev):
    Không cần làm gì, tự động dùng san_bong.db

2) MySQL:
    DATABASE_URL=mysql+pymysql://user:password@host:port/san_bong

3) Azure SQL Database / SQL Server:
    Cần Microsoft ODBC Driver 18 cài sẵn trên máy
    DATABASE_URL=mssql+pyodbc://user:password@server.database.windows.net:1433/san_bong?driver=ODBC+Driver+18+for+SQL+Server&Encrypt=yes&TrustServerCertificate=no
"""
import os
import logging
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv

logger = logging.getLogger("uvicorn.error")

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


# Dự án không dùng Alembic. Base.metadata.create_all() chỉ tạo BẢNG MỚI, không tự thêm CỘT MỚI
# vào bảng đã tồn tại — nên mỗi khi model có thêm cột, phải khai báo ở đây để tự "vá" schema cũ.
TABLE_MIGRATIONS: dict[str, dict[str, str]] = {
    "bookings": {
        "ngay_huy": "datetime",
        "stk_hoan_tien": "varchar(30)",
        "ten_tk_hoan_tien": "varchar(100)",
        "ngan_hang_hoan_tien": "varchar(100)",
        "da_doi_lich": "boolean",
        "ngay_doi_lich_gan_nhat": "datetime",
    },
}


def _column_ddl_type(dialect: str, py_type: str) -> str:
    if py_type == "boolean":
        return "BIT NOT NULL DEFAULT 0" if dialect == "mssql" else "BOOLEAN NOT NULL DEFAULT 0"
    if py_type == "datetime":
        return "DATETIME2" if dialect == "mssql" else "DATETIME"
    return py_type.upper()


def migrate_schema() -> None:
    """Tự thêm các cột còn thiếu vào bảng đã tồn tại, dựa trên TABLE_MIGRATIONS ở trên."""
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    add_kw = "ADD" if is_mssql else "ADD COLUMN"

    for table_name, columns in TABLE_MIGRATIONS.items():
        if table_name not in existing_tables:
            continue
        existing_cols = {c["name"] for c in inspector.get_columns(table_name)}
        with engine.begin() as conn:
            for col, py_type in columns.items():
                if col in existing_cols:
                    continue
                ddl_type = _column_ddl_type(engine.dialect.name, py_type)
                conn.execute(text(f"ALTER TABLE {table_name} {add_kw} {col} {ddl_type}"))
                logger.info(f"[MIGRATE] Đã thêm cột {table_name}.{col}")


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
