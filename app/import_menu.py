"""Import the menu JSON into the database (upsert by name).

The file is a JSON array in the ``ProductRead`` schema — the same shape returned
by ``GET /api/v1/products`` — with variants nested inside each product::

    [{"product_name": str, "description": str, "price": "11.00",
      "stock_quantity": int, "image_url": str | null, "category_id": int,
      "product_id": int,
      "variants": [{"variant_id": int, "name": str, "group_name": str,
                    "price_delta": "0.00", "stock_quantity": int | null,
                    "sort_order": int}, ...]}, ...]

``product_id`` and ``variant_id`` are ignored while importing: rows are matched
by product name and ``(product_id, name)`` so the file can be replayed on any
database.

Usage::

    python -m app.import_menu menu_import.json            # apply
    python -m app.import_menu menu_import.json --dry-run  # validate only
"""

import argparse
import json
import sys
from decimal import Decimal
from pathlib import Path

from sqlalchemy import select

from app import models
from app.database import SessionLocal

VARIANTS_FILENAME = "menu_variants.json"


def money(value) -> Decimal:
    return Decimal(str(value)).quantize(Decimal("0.01"))


def load_payload(path: Path) -> tuple[list[dict], list[dict]]:
    """Return ``(products, variants)``; variants may be nested or in a companion file."""
    data = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(data, dict):
        products = data.get("products", [])
        variants = list(data.get("variants", []))
    else:
        products = data
        variants = [
            {**variant, "product_name": product["product_name"]}
            for product in products
            for variant in product.get("variants", [])
        ]

    variants_path = path.parent / VARIANTS_FILENAME
    if not variants and variants_path.exists():
        variants = json.loads(variants_path.read_text(encoding="utf-8"))
    return products, variants


def import_menu(path: Path, dry_run: bool = False) -> int:
    products, variants = load_payload(path)

    created_products = updated_products = 0
    created_variants = updated_variants = 0
    product_ids: dict[str, int] = {}

    with SessionLocal() as db:
        for entry in products:
            category = db.get(models.Category, entry["category_id"])
            if category is None:
                raise SystemExit(
                    f"Unknown category_id {entry['category_id']} for "
                    f"{entry['product_name']!r}. Create the category first "
                    "(admin page → Products, or POST /api/v1/categories) and "
                    "update category_id in the JSON to the id it was given."
                )

            product = db.scalar(
                select(models.Product).where(
                    models.Product.product_name == entry["product_name"]
                )
            )
            if product is None:
                product = models.Product(product_name=entry["product_name"])
                db.add(product)
                created_products += 1
            else:
                updated_products += 1

            product.description = entry.get("description")
            product.price = money(entry["price"])
            product.stock_quantity = int(entry.get("stock_quantity", 0))
            product.image_url = entry.get("image_url") or None
            product.category_id = category.category_id
            db.flush()
            product_ids[product.product_name] = product.product_id

        for entry in variants:
            product_id = product_ids.get(entry["product_name"])
            if product_id is None:
                raise SystemExit(f"Variant references unknown product: {entry['product_name']}")

            variant = db.scalar(
                select(models.ProductVariant).where(
                    models.ProductVariant.product_id == product_id,
                    models.ProductVariant.name == entry["name"],
                )
            )
            if variant is None:
                variant = models.ProductVariant(product_id=product_id, name=entry["name"])
                db.add(variant)
                created_variants += 1
            else:
                updated_variants += 1

            variant.group_name = entry.get("group_name", "Size")
            variant.price_delta = money(entry.get("price_delta", 0))
            variant.stock_quantity = entry.get("stock_quantity")
            variant.sort_order = int(entry.get("sort_order", 0))
        db.flush()

        if dry_run:
            db.rollback()
        else:
            db.commit()

    mode = "DRY RUN (rolled back)" if dry_run else "applied"
    print(f"{mode}: {path}")
    print(f"  products created: {created_products}, updated: {updated_products}")
    print(f"  variants created: {created_variants}, updated: {updated_variants}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("file", type=Path, help="path to the menu products JSON file")
    parser.add_argument("--dry-run", action="store_true", help="validate without saving")
    args = parser.parse_args()
    return import_menu(args.file, dry_run=args.dry_run)


if __name__ == "__main__":
    sys.exit(main())
