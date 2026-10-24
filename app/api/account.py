"""Customer wallet endpoints — balance, top-up and the transaction ledger."""

from decimal import Decimal
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models, schemas, store_settings
from app.api.deps import get_current_customer
from app.database import get_db


router = APIRouter(prefix="/account", tags=["Account"])


def _wallet_payload(
    db: Session, customer: models.Customer
) -> schemas.WalletSummary:
    settings = store_settings.load_settings(db)
    transactions = db.scalars(
        select(models.BalanceTransaction)
        .where(models.BalanceTransaction.customer_id == customer.customer_id)
        .order_by(models.BalanceTransaction.created_at.desc())
        .limit(50)
    ).all()
    return schemas.WalletSummary(
        customer_id=customer.customer_id,
        balance=customer.balance,
        max_balance=settings.maximum_balance,
        recharge_minimum=settings.balance_recharge_minimum,
        transactions=transactions,
    )


@router.get("/wallet", response_model=schemas.WalletSummary)
def get_wallet(
    customer: models.Customer = Depends(get_current_customer),
    db: Session = Depends(get_db),
):
    return _wallet_payload(db, customer)


@router.get("/transactions", response_model=List[schemas.BalanceTransactionRead])
def list_transactions(
    customer: models.Customer = Depends(get_current_customer),
    db: Session = Depends(get_db),
):
    return db.scalars(
        select(models.BalanceTransaction)
        .where(models.BalanceTransaction.customer_id == customer.customer_id)
        .order_by(models.BalanceTransaction.created_at.desc())
        .limit(100)
    ).all()


@router.post("/wallet/topup", response_model=schemas.WalletSummary)
def top_up(
    payload: schemas.TopUpRequest,
    customer: models.Customer = Depends(get_current_customer),
    db: Session = Depends(get_db),
):
    """Credit the wallet.

    Real deployments replace this with a WeChat Pay / Feishu Pay callback;
    until gateway credentials are supplied the credit is applied directly so
    the balance flow can be exercised end to end.
    """
    settings = store_settings.load_settings(db)
    amount = Decimal(payload.amount).quantize(Decimal("0.01"))

    if amount < settings.balance_recharge_minimum:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Minimum top-up is ¥{settings.balance_recharge_minimum}",
        )
    if Decimal(customer.balance) + amount > settings.maximum_balance:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Balance cannot exceed ¥{settings.maximum_balance}. "
                f"Current balance is ¥{customer.balance}."
            ),
        )

    store_settings.add_balance_entry(
        db,
        customer,
        amount,
        "topup",
        note=payload.note or "Wallet top-up",
    )
    store_settings.record_audit(
        db,
        customer.customer_id,
        "balanceTopUp",
        target=f"customer:{customer.customer_id}",
        detail=f"+¥{amount}",
    )
    db.commit()
    db.refresh(customer)
    return _wallet_payload(db, customer)
