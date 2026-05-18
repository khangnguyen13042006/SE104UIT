from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import (
    hash_password, verify_password, create_access_token, get_current_user
)
from app.core.config import UserRole, UserStatus
from app.models import User
from app.schemas import UserRegister, UserLogin, Token, UserOut

router = APIRouter(prefix="/api/auth", tags=["Auth"])


@router.post("/register", response_model=Token)
def register(payload: UserRegister, db: Session = Depends(get_db)):
    # Enforce @gmail.com cho user thường (khách hàng tự đăng ký)
    if not payload.email.lower().endswith("@gmail.com"):
        raise HTTPException(400, "Vui lòng dùng email Gmail (@gmail.com)")

    # Kiểm tra trùng email/sdt
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(400, "Email đã được sử dụng")
    if db.query(User).filter(User.sdt == payload.sdt).first():
        raise HTTPException(400, "Số điện thoại đã được sử dụng")

    # Khách hàng tự đăng ký: chỉ được role KHACH_HANG
    role = payload.vai_tro or UserRole.KHACH_HANG
    if role != UserRole.KHACH_HANG:
        raise HTTPException(400, "Chỉ Admin mới được tạo tài khoản nhân viên")

    user = User(
        ho_ten=payload.ho_ten,
        email=payload.email,
        sdt=payload.sdt,
        mat_khau_hash=hash_password(payload.mat_khau),
        vai_tro=role,
        trang_thai=UserStatus.HOAT_DONG,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_access_token({"sub": str(user.id), "role": user.vai_tro.value})
    return Token(access_token=token, user=UserOut.model_validate(user))


@router.post("/login", response_model=Token)
def login(payload: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    if not user or not verify_password(payload.mat_khau, user.mat_khau_hash):
        raise HTTPException(401, "Email hoặc mật khẩu không đúng")
    if user.trang_thai == UserStatus.VO_HIEU_HOA:
        raise HTTPException(403, "Tài khoản đã bị vô hiệu hoá")
    token = create_access_token({"sub": str(user.id), "role": user.vai_tro.value})
    return Token(access_token=token, user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user
