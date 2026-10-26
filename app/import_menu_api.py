"""Import the menu through the REST API instead of writing to the database file.

The file is a JSON array in the ``ProductRead`` schema with variants nested
inside each product, so one file carries everything. Because
``POST /products/{id}/variants`` takes a single object, this script posts each
variant separately with the id returned when its product was created.

**Category handling** — the script creates missing categories automatically.
Each product should carry a ``category_name`` field; if a category with that
name doesn't exist on the server, it will be created before products are
posted. The ``category_id`` in the JSON is ignored; IDs are resolved by name.

Usage::

    python -m app.import_menu_api menu_import.json --base-url http://127.0.0.1:8002

Products are matched by name (created if missing, patched if present) and
variants by ``(product_id, name)``, so it is safe to run more than once.
"""

import argparse
import json
import sys
from pathlib import Path

import httpx

ADMIN_EMAIL = "admin"
ADMIN_PASSWORD = "admin"
VARIANT_FIELDS = ("name", "group_name", "price_delta", "stock_quantity", "sort_order")
PRODUCT_FIELDS = ("product_name", "description", "price", "stock_quantity")


def load_files(path: Path) -> tuple[list[dict], list[dict]]:
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

    companion = path.parent / "menu_variants.json"
    if not variants and companion.exists():
        payload = json.loads(companion.read_text(encoding="utf-8"))
        variants = payload if isinstance(payload, list) else payload.get("variants", [])
    return products, variants


def _ensure_categories(
    client: httpx.Client, products: list[dict]
) -> dict[str, int]:
    """Fetch existing categories, create any missing ones, return name→ID map."""
    needed_names = sorted({p.get("category_name") for p in products if p.get("category_name")})
    existing = {
        c["category_name"]: c["category_id"]
        for c in client.get("/api/v1/categories").json()
    }

    for name in needed_names:
        if name in existing:
            continue
        resp = client.post("/api/v1/categories", json={"category_name": name})
        if resp.status_code != 201:
            raise SystemExit(
                f"Failed to create category {name!r} ({resp.status_code}): {resp.text}"
            )
        existing[name] = resp.json()["category_id"]
        print(f"  created category: {name} (id={existing[name]})")

    print(f"  categories ready: {existing}")
    return existing


def import_via_api(path: Path, base_url: str) -> int:
    products, variants = load_files(path)
    created_p = updated_p = created_v = updated_v = 0

    with httpx.Client(base_url=base_url.rstrip("/"), timeout=30.0, trust_env=False) as client:
        # 1. Admin login
        login = client.post(
            "/api/v1/auth/admin/login",
            json={"email": ADMIN_EMAIL, "last_name": ADMIN_PASSWORD},
        )
        if login.status_code != 200:
            raise SystemExit(f"Admin login failed ({login.status_code}): {login.text}")
        print(f"admin login OK, session cookie set")

        # 2. Ensure categories exist (create missing ones, map by name)
        name_to_id = _ensure_categories(client, products)

        # 3. Fetch existing products for upsert matching
        existing = {
            row["product_name"]: row
            for row in client.get("/api/v1/products", params={"limit": 500}).json()
        }

        # 4. Create/update products
        product_ids: dict[str, int] = {}
        for entry in products:
            cat_name = entry.get("category_name")
            cat_id = name_to_id.get(cat_name) if cat_name else entry.get("category_id")
            if cat_id is None:
                raise SystemExit(
                    f"Product {entry['product_name']!r} has no category_name and "
                    f"no category_id — add category_name to the JSON."
                )

            body = {key: entry.get(key) for key in PRODUCT_FIELDS}
            body["image_url"] = entry.get("image_url") or None
            body["category_id"] = cat_id

            current = existing.get(entry["product_name"])
            if current:
                product_id = current["product_id"]
                response = client.patch(f"/api/v1/products/{product_id}", json=body)
                updated_p += 1
            else:
                response = client.post("/api/v1/products", json=body)
                created_p += 1

            if response.status_code >= 400:
                raise SystemExit(
                    f"Product {entry['product_name']!r} failed "
                    f"({response.status_code}): {response.text}"
                )
            product_ids[entry["product_name"]] = response.json()["product_id"]

        # 5. Create/update variants
        variant_ids: dict[int, dict[str, int]] = {}
        for entry in variants:
            product_id = product_ids.get(entry["product_name"])
            if product_id is None:
                raise SystemExit(f"Variant references unknown product: {entry['product_name']}")

            if product_id not in variant_ids:
                detail = client.get(f"/api/v1/products/{product_id}").json()
                variant_ids[product_id] = {
                    row["name"]: row["variant_id"] for row in detail.get("variants", [])
                }

            body = {key: entry.get(key) for key in VARIANT_FIELDS}
            known = variant_ids[product_id].get(entry["name"])
            if known:
                response = client.patch(
                    f"/api/v1/products/{product_id}/variants/{known}", json=body
                )
                updated_v += 1
            else:
                response = client.post(f"/api/v1/products/{product_id}/variants", json=body)
                created_v += 1

            if response.status_code >= 400:
                raise SystemExit(
                    f"Variant {entry['name']!r} on {entry['product_name']!r} failed "
                    f"({response.status_code}): {response.text}"
                )

    print(f"\napplied via API: {base_url}")
    print(f"  products created: {created_p}, updated: {updated_p}")
    print(f"  variants created: {created_v}, updated: {updated_v}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("file", type=Path, help="path to the menu products JSON file")
    parser.add_argument(
        "--base-url",
        default="http://127.0.0.1:8002",
        help="API root (default: http://127.0.0.1:8002)",
    )
    args = parser.parse_args()
    return import_via_api(args.file, args.base_url)


if __name__ == "__main__":
    sys.exit(main())
