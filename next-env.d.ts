# ============================================================================
# Frontend Environment — Sân Bóng UIT
# ============================================================================
# Copy thành `.env.local` cho local dev:
#   cp .env.local.example .env.local

# ===== Local development =====
NEXT_PUBLIC_API_URL=http://localhost:8000

# ===== Production (Vercel) =====
# Thay <render-app-name> bằng tên service Render thật của bạn.
# Ví dụ: NEXT_PUBLIC_API_URL=https://sanbong-api.onrender.com
#
# Cách set trên Vercel:
#   1. Vercel Dashboard → Project Settings → Environment Variables
#   2. Add new: NEXT_PUBLIC_API_URL = https://YOUR-RENDER-APP.onrender.com
#   3. Apply to: Production, Preview, Development
#   4. Redeploy project

# NEXT_PUBLIC_API_URL=https://sanbong-api.onrender.com
