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

## React frontend

The responsive React interface includes ordering, persistent shopping cart, checkout,
pay-now and 赊账 duration options, account activity, privacy controls, and English/Chinese
language switching.

赊账 terms are persisted by the backend and limited to **1–14 days**. If a tab becomes
overdue, the customer's ordering access is locked until the tab is settled from the
account page. The UI also includes a cart-clear action and a dedicated Shop page with
search, category filters, price/name/stock sorting, and inventory status.

```bash
cd frontend
npm install
npm run build
cd ..
uvicorn app.main:app --reload
```

The production frontend is served by FastAPI at <http://127.0.0.1:8000>. For frontend
development, run `npm run dev` in `frontend/`; Vite proxies API requests to port 8000.

### SEIUE OneLogin

The account page uses BAID OneLogin's OAuth2 authorization-code flow. Register Whale as
an approved application in [baid-onelogin](https://github.com/WebArtistryBAID/baid-onelogin),
allow the `basic` scope, and register this exact redirect URL:

```text
http://127.0.0.1:8000/api/v1/auth/callback
```

Then copy `.env.example` to `.env` and set `ONELOGIN_CLIENT_ID`,
`ONELOGIN_CLIENT_SECRET`, and a strong random `AUTH_STATE_SECRET`. Client secrets remain
server-side. OAuth state is verified and login sessions use signed, HTTP-only cookies.

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
## GitHub Pages deployment

The built React frontend is deployed from the repository root (served at `https://stickbrime.github.io`).

```bash
cd frontend
npm install
npm run build      # uses base ./ and emits to frontend/dist
cd ..
# Copy the production build to the repo root for GitHub Pages
cp -r frontend/dist/assets ./assets
cp frontend/dist/index.html ./index.html
git add index.html assets
# Commit and push from the default branch, then enable Pages in repo settings
```

Note: The frontend expects the FastAPI backend (with the `/api` endpoints) at `/api`. A live API must be hosted separately for ordering, login, and menu data to work.
