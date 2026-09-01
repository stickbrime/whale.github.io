"""Employee CRUD endpoints."""

from typing import List

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models, schemas
from app.api.common import commit_or_conflict, get_or_404
from app.database import get_db


router = APIRouter(prefix="/employees", tags=["Employees"])


@router.post("", response_model=schemas.EmployeeRead, status_code=status.HTTP_201_CREATED)
def create_employee(payload: schemas.EmployeeCreate, db: Session = Depends(get_db)):
    employee = models.Employee(**payload.model_dump())
    db.add(employee)
    commit_or_conflict(db, "An employee with this phone already exists")
    db.refresh(employee)
    return employee


@router.get("", response_model=List[schemas.EmployeeRead])
def list_employees(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    return db.scalars(
        select(models.Employee).order_by(models.Employee.employee_id).offset(skip).limit(limit)
    ).all()


@router.get("/{employee_id}", response_model=schemas.EmployeeRead)
def get_employee(employee_id: int, db: Session = Depends(get_db)):
    return get_or_404(db, models.Employee, employee_id, "Employee")


@router.patch("/{employee_id}", response_model=schemas.EmployeeRead)
def update_employee(
    employee_id: int, payload: schemas.EmployeeUpdate, db: Session = Depends(get_db)
):
    employee = get_or_404(db, models.Employee, employee_id, "Employee")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(employee, field, value)
    commit_or_conflict(db, "The updated phone is already in use")
    db.refresh(employee)
    return employee


@router.delete("/{employee_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_employee(employee_id: int, db: Session = Depends(get_db)) -> Response:
    employee = get_or_404(db, models.Employee, employee_id, "Employee")
    db.delete(employee)
    commit_or_conflict(db, "The employee could not be deleted")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
