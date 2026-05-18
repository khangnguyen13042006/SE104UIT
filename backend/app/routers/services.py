from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional, List
from app.core.database import get_db
from app.core.security import require_roles
from app.core.config import UserRole, ServiceStatus
from app.models import Service, User
from app.schemas import ServiceCreate, ServiceUpdate, ServiceOut

router = APIRouter(prefix="/api/services", tags=["Services"])


@router.get("", response_model=List[ServiceOut])
def list_services(trang_thai: Optional[ServiceStatus] = None, db: Session = Depends(get_db)):
    q = db.query(Service)
    if trang_thai:
        q = q.filter(Service.trang_thai == trang_thai)
    return q.order_by(Service.id).all()


@router.post("", response_model=ServiceOut)
def create_service(
    payload: ServiceCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.ADMIN, UserRole.QUAN_LY)),
):
    svc = Service(**payload.model_dump())
    db.add(svc)
    db.commit()
    db.refresh(svc)
    return svc


@router.put("/{service_id}", response_model=ServiceOut)
def update_service(
    service_id: int,
    payload: ServiceUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.ADMIN, UserRole.QUAN_LY)),
):
    svc = db.query(Service).filter(Service.id == service_id).first()
    if not svc:
        raise HTTPException(404, "Không tìm thấy dịch vụ")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(svc, k, v)
    db.commit()
    db.refresh(svc)
    return svc
