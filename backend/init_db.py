from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional, List
from app.core.database import get_db
from app.core.security import require_roles, hash_password
from app.core.config import UserRole, UserStatus
from app.models import User
from app.schemas import UserOut, UserUpdate, UserRegister

router = APIRouter(prefix="/api/users", tags=["Users"])


@router.get("", response_model=List[UserOut])
def list_users(
    vai_tro: Optional[UserRole] = None,
    keyword: Optional[str] = None,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.ADMIN, UserRole.QUAN_LY)),
):
    q = db.query(User)
    if vai_tro:
        q = q.filter(User.vai_tro == vai_tro)
    if keyword:
        like = f"%{keyword}%"
        q = q.filter((User.ho_ten.ilike(like)) | (User.email.ilike(like)) | (User.sdt.ilike(like)))
    return q.order_by(User.id.desc()).all()


@router.post("", response_model=UserOut)
def create_user(
    payload: UserRegister,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.ADMIN)),
):
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(400, "Email đã được sử dụng")
    if db.query(User).filter(User.sdt == payload.sdt).first():
        raise HTTPException(400, "SĐT đã được sử dụng")
    user = User(
        ho_ten=payload.ho_ten,
        email=payload.email,
        sdt=payload.sdt,
        mat_khau_hash=hash_password(payload.mat_khau),
        vai_tro=payload.vai_tro or UserRole.KHACH_HANG,
        trang_thai=UserStatus.HOAT_DONG,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.get("/{user_id}", response_model=UserOut)
def get_user(user_id: int, db: Session = Depends(get_db), _: User = Depends(require_roles(UserRole.ADMIN, UserRole.QUAN_LY))):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "Không tìm thấy tài khoản")
    return user


@router.put("/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.ADMIN)),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "Không tìm thấy tài khoản")

    # Không cho vô hiệu hoá admin cuối cùng
    if payload.trang_thai == UserStatus.VO_HIEU_HOA and user.vai_tro == UserRole.ADMIN:
        active_admins = db.query(User).filter(
            User.vai_tro == UserRole.ADMIN,
            User.trang_thai == UserStatus.HOAT_DONG,
        ).count()
        if active_admins <= 1:
            raise HTTPException(400, "Không thể vô hiệu hoá Admin duy nhất còn hoạt động")

    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(user, k, v)
    db.commit()
    db.refresh(user)
    return user
