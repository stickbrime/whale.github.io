"""Insert a small, idempotent demo menu for local development."""

from datetime import date
from decimal import Decimal

from sqlalchemy import select

from app import models
from app.database import Base, SessionLocal, engine


def seed_database() -> None:
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        if db.scalar(select(models.Category.category_id).limit(1)) is not None:
            print("Database already contains data; seed skipped.")
            return

        coffee = models.Category(category_name="Coffee")
        tea = models.Category(category_name="Tea")
        bakery = models.Category(category_name="Bakery")
        db.add_all([coffee, tea, bakery])
        db.flush()

        db.add_all(
            [
                models.Product(
                    product_name="Espresso",
                    description="A concentrated double shot of house espresso.",
                    price=Decimal("3.25"),
                    stock_quantity=100,
                    category_id=coffee.category_id,
                ),
                models.Product(
                    product_name="Cappuccino",
                    description="Espresso with steamed milk and a deep foam layer.",
                    price=Decimal("4.75"),
                    stock_quantity=80,
                    category_id=coffee.category_id,
                ),
                models.Product(
                    product_name="Cold Brew",
                    description="Slow-steeped coffee served over ice.",
                    price=Decimal("4.50"),
                    stock_quantity=60,
                    category_id=coffee.category_id,
                ),
                models.Product(
                    product_name="Chai Latte",
                    description="Spiced black tea with steamed milk.",
                    price=Decimal("4.25"),
                    stock_quantity=50,
                    category_id=tea.category_id,
                ),
                models.Product(
                    product_name="Butter Croissant",
                    description="A flaky, all-butter pastry.",
                    price=Decimal("3.50"),
                    stock_quantity=25,
                    category_id=bakery.category_id,
                ),
            ]
        )
        db.add(
            models.Employee(
                first_name="Alex",
                last_name="Morgan",
                role="Barista",
                phone="+1-555-0100",
                hire_date=date.today(),
            )
        )
        db.commit()
        print("Demo categories, products, and employee created.")


if __name__ == "__main__":
    seed_database()
