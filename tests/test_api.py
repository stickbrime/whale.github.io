"""Integration tests for CRUD, order totals, stock, and failure outcomes."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from tests.conftest import TestingSessionLocal


def create_customer(client: TestClient) -> dict:
    response = client.post(
        "/api/v1/customers",
        json={
            "first_name": "Jamie",
            "last_name": "Rivera",
            "email": "jamie@example.com",
            "phone": "+1-555-0199",
        },
    )
    assert response.status_code == 201
    return response.json()


def create_product(client: TestClient, stock: int = 10) -> dict:
    category = client.post("/api/v1/categories", json={"category_name": "Coffee"})
    assert category.status_code == 201
    response = client.post(
        "/api/v1/products",
        json={
            "product_name": "Flat White",
            "description": "Double ristretto with steamed milk",
            "price": "4.25",
            "stock_quantity": stock,
            "category_id": category.json()["category_id"],
        },
    )
    assert response.status_code == 201
    return response.json()


def test_health_and_openapi_are_available(client: TestClient):
    health = client.get("/health")
    assert health.status_code == 200
    assert health.json()["status"] == "healthy"
    assert client.get("/openapi.json").status_code == 200


def test_customer_crud_and_duplicate_email(client: TestClient):
    customer = create_customer(client)
    customer_id = customer["customer_id"]
    duplicate = client.post(
        "/api/v1/customers",
        json={
            "first_name": "Other",
            "last_name": "Person",
            "email": "jamie@example.com",
            "phone": "+1-555-0111",
        },
    )
    assert duplicate.status_code == 409
    updated = client.patch(
        f"/api/v1/customers/{customer_id}", json={"loyalty_points": 25}
    )
    assert updated.status_code == 200
    assert updated.json()["loyalty_points"] == 25
    assert len(client.get("/api/v1/customers").json()) == 1


def test_order_calculates_total_and_decrements_stock(client: TestClient):
    customer = create_customer(client)
    product = create_product(client, stock=10)
    response = client.post(
        "/api/v1/orders",
        json={
            "customer_id": customer["customer_id"],
            "pickup_time": "10:30:00",
            "items": [
                {
                    "product_id": product["product_id"],
                    "quantity": 2,
                    "customization": "Oat milk, extra hot",
                }
            ],
        },
    )
    assert response.status_code == 201, response.text
    order = response.json()
    assert order["total_amount"] == "8.50"
    assert order["items"][0]["subtotal"] == "8.50"
    assert order["items"][0]["product"]["product_name"] == "Flat White"
    remaining = client.get(f"/api/v1/products/{product['product_id']}").json()
    assert remaining["stock_quantity"] == 8
    history = client.get(f"/api/v1/customers/{customer['customer_id']}/orders")
    assert history.status_code == 200
    assert history.json()[0]["order_id"] == order["order_id"]


def test_insufficient_stock_rejects_entire_order(client: TestClient):
    customer = create_customer(client)
    product = create_product(client, stock=1)
    response = client.post(
        "/api/v1/orders",
        json={
            "customer_id": customer["customer_id"],
            "items": [{"product_id": product["product_id"], "quantity": 2}],
        },
    )
    assert response.status_code == 409
    unchanged = client.get(f"/api/v1/products/{product['product_id']}").json()
    assert unchanged["stock_quantity"] == 1
    assert client.get("/api/v1/orders").json() == []


def test_cancelling_order_restores_inventory_and_is_terminal(client: TestClient):
    customer = create_customer(client)
    product = create_product(client, stock=5)
    created = client.post(
        "/api/v1/orders",
        json={
            "customer_id": customer["customer_id"],
            "items": [{"product_id": product["product_id"], "quantity": 3}],
        },
    ).json()
    cancelled = client.patch(
        f"/api/v1/orders/{created['order_id']}",
        json={"payment_status": "cancelled"},
    )
    assert cancelled.status_code == 200
    assert cancelled.json()["payment_status"] == "cancelled"
    assert client.get(f"/api/v1/products/{product['product_id']}").json()[
        "stock_quantity"
    ] == 5
    invalid_transition = client.patch(
        f"/api/v1/orders/{created['order_id']}", json={"payment_status": "paid"}
    )
    assert invalid_transition.status_code == 409
    assert client.get(f"/api/v1/products/{product['product_id']}").json()[
        "stock_quantity"
    ] == 5


def test_inventory_adjustment_cannot_make_stock_negative(client: TestClient):
    product = create_product(client, stock=2)
    response = client.patch(
        f"/api/v1/products/{product['product_id']}/stock",
        json={"quantity_change": -3},
    )
    assert response.status_code == 409


def test_database_rejects_malformed_customer_date_from_raw_sql(client: TestClient):
    """A DB editor/raw query can no longer introduce values that crash ORM reads."""
    with TestingSessionLocal() as db:
        with pytest.raises(IntegrityError):
            db.execute(
                text(
                    """
                    INSERT INTO customers
                        (first_name, last_name, email, phone, loyalty_points, join_date)
                    VALUES
                        ('Bad', 'Date', 'bad-date@example.com', '+1-555-0123', 0, 'not-a-date')
                    """
                )
            )
            db.commit()
        db.rollback()

    response = client.get("/api/v1/customers")
    assert response.status_code == 200
    assert response.json() == []
