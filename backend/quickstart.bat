@echo off
REM Quickstart cho Windows - chay backend tu A den Z
REM Cach dung: double-click quickstart.bat hoac chay tu cmd

cd /d "%~dp0"

echo === Kiem tra Python ===
python --version || (echo Can Python 3.10+ && pause && exit /b 1)

echo === Cai thu vien ===
pip install -q -r requirements.txt

echo === Tao lai database va seed du lieu mau ===
del /Q san_bong.db 2>nul
python seed.py

echo.
echo === Khoi dong backend tren http://localhost:8000 ===
echo     Swagger UI: http://localhost:8000/docs
echo     Nhan Ctrl+C de dung
echo.
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
