# Coffee Shop Ordering API

A FastAPI backend based on the supplied coffee shop ER diagram. It manages customers,
employees, categories, products, inventory, orders, and order items using SQLAlchemy and
SQLite. FastAPI automatically provides interactive OpenAPI documentation.

## Features

- CRUD APIs for `Customer`, `Employee`, `Category`, and `Product`
- Menu filtering by category, name, and stock availability
- Transactional order creation with server-side price/subtotal/total calculation
- Stock checks, automatic deduction, and restoration after cancellation/refund/failure
- Payment-state transition validation and customer order history
- Input validation, database constraints, configurable CORS, seed data, and tests

## Run locally

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python -m app.seed               # optional demo menu
uvicorn app.main:app --reload
```

Open the API documentation at <http://127.0.0.1:8000/docs>, alternative documentation
at <http://127.0.0.1:8000/redoc>, or the health check at
<http://127.0.0.1:8000/health>. The SQLite database is created automatically.

## API overview

All business endpoints use the `/api/v1` prefix.

| Resource | Main routes |
| --- | --- |
| Customers | `GET/POST /customers`, `GET/PATCH/DELETE /customers/{id}` |
| Customer history | `GET /customers/{id}/orders` |
| Employees | `GET/POST /employees`, `GET/PATCH/DELETE /employees/{id}` |
| Categories | `GET/POST /categories`, `GET/PUT/DELETE /categories/{id}` |
| Products | `GET/POST /products`, `GET/PATCH/DELETE /products/{id}` |
| Inventory | `PATCH /products/{id}/stock` |
| Orders | `GET/POST /orders`, `GET/PATCH/DELETE /orders/{id}` |

### Create an order

The frontend sends product IDs and quantities. The backend reads current prices,
calculates monetary fields, checks stock, and deducts inventory atomically.

```json
{
  "customer_id": 1,
  "employee_id": 1,
  "pickup_time": "10:30:00",
  "payment_status": "pending",
  "items": [
    {
      "product_id": 2,
      "quantity": 2,
      "customization": "Oat milk, one extra shot"
    }
  ]
}
```

Send this body to `POST /api/v1/orders`. New orders may be `pending` or `paid`.
Supported transitions are `pending` → `paid`, `failed`, or `cancelled`, and `paid` →
`refunded` or `cancelled`. Failure/cancellation/refund restores inventory.

## Frontend and database configuration

Set permitted frontend URLs in `.env`:

```env
CORS_ORIGINS=http://localhost:3000,http://localhost:5173
```

The frontend can call `http://127.0.0.1:8000/api/v1/products`. SQLite is the default;
another SQLAlchemy URL can be supplied through `DATABASE_URL`.

## Tests

```bash
pytest -q
```

Tests use an isolated in-memory database and do not modify application data.