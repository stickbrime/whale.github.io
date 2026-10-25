"""Repair legacy SQLite rows and protect typed columns from direct corruption.

FastAPI/Pydantic validates every API request, but SQLite's dynamic typing still allows a
database editor (or raw SQL) to place arbitrary text in DATE/TIME columns. SQLAlchemy
then correctly refuses to deserialize those values. These startup checks repair legacy
rows and triggers prevent the same corruption from being written again.
"""

import sqlite3

from sqlalchemy.engine import Engine


def prepare_database(engine: Engine) -> None:
    """Repair known malformed SQLite values and install direct-write safeguards."""
    if engine.dialect.name != "sqlite":
        return

    # SQLite cannot alter CHECK constraints, so the orders table is rebuilt
    # once when the wallet payment method first becomes available.
    _ensure_orders_table(engine)

    with engine.begin() as connection:
        _ensure_product_image_url_column(connection)
        _ensure_customer_account_columns(connection)
        _ensure_order_item_variant_columns(connection)
        _ensure_product_variant_group_column(connection)

        # Preserve recoverable records rather than deleting them. Invalid user-entered
        # dates are replaced with safe defaults; malformed optional times become NULL.
        connection.exec_driver_sql(
            """
            UPDATE customers
            SET join_date = date('now')
            WHERE join_date IS NULL
               OR length(join_date) != 10
               OR date(join_date) IS NULL
               OR date(join_date) != join_date
            """
        )
        connection.exec_driver_sql(
            """
            UPDATE customers
            SET email = 'recovered-customer-' || customer_id || '@example.com'
            WHERE email IS NULL OR email NOT LIKE '%_@_%._%'
            """
        )
        connection.exec_driver_sql(
            "UPDATE customers SET first_name = 'Recovered' "
            "WHERE first_name IS NULL OR length(trim(first_name)) = 0"
        )
        connection.exec_driver_sql(
            "UPDATE customers SET last_name = 'Customer' "
            "WHERE last_name IS NULL OR length(trim(last_name)) = 0"
        )
        connection.exec_driver_sql(
            "UPDATE customers SET phone = 'recovered-' || customer_id "
            "WHERE phone IS NULL OR length(trim(phone)) < 5"
        )
        connection.exec_driver_sql(
            "UPDATE customers SET loyalty_points = 0 "
            "WHERE typeof(loyalty_points) != 'integer' OR loyalty_points < 0"
        )

        connection.exec_driver_sql(
            """
            UPDATE employees
            SET hire_date = date('now')
            WHERE hire_date IS NULL
               OR length(hire_date) != 10
               OR date(hire_date) IS NULL
               OR date(hire_date) != hire_date
            """
        )
        connection.exec_driver_sql(
            """
            UPDATE orders
            SET order_date = strftime('%Y-%m-%d %H:%M:%S', 'now')
            WHERE order_date IS NULL OR datetime(order_date) IS NULL
            """
        )
        connection.exec_driver_sql(
            """
            UPDATE orders
            SET pickup_time = NULL
            WHERE pickup_time IS NOT NULL AND time(pickup_time) IS NULL
            """
        )
        connection.exec_driver_sql(
            """
            UPDATE orders
            SET payment_status = 'pending'
            WHERE payment_status NOT IN ('pending', 'paid', 'failed', 'refunded', 'cancelled')
            """
        )
        connection.exec_driver_sql(
            """
            UPDATE orders
            SET payment_method = 'wechat'
            WHERE payment_method NOT IN ('cash', 'wechat', 'alipay', 'card', 'balance', 'pay_later')
            """
        )
        connection.exec_driver_sql(
            "UPDATE orders SET fulfillment_status = 'waiting' "
            "WHERE fulfillment_status NOT IN ('waiting', 'done')"
        )
        connection.exec_driver_sql(
            "UPDATE customers SET balance = 0 "
            "WHERE balance IS NULL OR typeof(balance) NOT IN ('real', 'integer') OR balance < 0"
        )
        connection.exec_driver_sql(
            "UPDATE customers SET role = 'customer' "
            "WHERE role IS NULL OR role NOT IN ('customer', 'student', 'staff', 'admin')"
        )

        _install_validation_triggers(connection)


def _install_validation_triggers(connection) -> None:
    customer_validation = """
        NEW.first_name IS NULL OR length(trim(NEW.first_name)) = 0
        OR NEW.last_name IS NULL OR length(trim(NEW.last_name)) = 0
        OR NEW.email IS NULL OR NEW.email NOT LIKE '%_@_%._%'
        OR NEW.phone IS NULL OR length(trim(NEW.phone)) < 5
        OR typeof(NEW.loyalty_points) != 'integer' OR NEW.loyalty_points < 0
        OR NEW.join_date IS NULL OR length(NEW.join_date) != 10
        OR date(NEW.join_date) IS NULL OR date(NEW.join_date) != NEW.join_date
    """
    employee_validation = """
        NEW.first_name IS NULL OR length(trim(NEW.first_name)) = 0
        OR NEW.last_name IS NULL OR length(trim(NEW.last_name)) = 0
        OR NEW.role IS NULL OR length(trim(NEW.role)) = 0
        OR NEW.phone IS NULL OR length(trim(NEW.phone)) < 5
        OR NEW.hire_date IS NULL OR length(NEW.hire_date) != 10
        OR date(NEW.hire_date) IS NULL OR date(NEW.hire_date) != NEW.hire_date
    """
    order_validation = """
        NEW.order_date IS NULL OR datetime(NEW.order_date) IS NULL
        OR NEW.pickup_time IS NOT NULL AND time(NEW.pickup_time) IS NULL
        OR NEW.payment_status NOT IN ('pending', 'paid', 'failed', 'refunded', 'cancelled')
        OR NEW.payment_method NOT IN ('cash', 'wechat', 'alipay', 'card', 'balance', 'pay_later')
        OR NEW.fulfillment_status NOT IN ('waiting', 'done')
    """

    for table, condition, message in (
        ("customers", customer_validation, "invalid customer data"),
        ("employees", employee_validation, "invalid employee data"),
        ("orders", order_validation, "invalid order date, time, or status"),
    ):
        for operation in ("INSERT", "UPDATE"):
            trigger_name = f"validate_{table}_{operation.lower()}"
            # Triggers persist across restarts, so recreate them to pick up
            # newly allowed values (e.g. the balance payment method).
            connection.exec_driver_sql(f"DROP TRIGGER IF EXISTS {trigger_name}")
            connection.exec_driver_sql(
                f"""
                CREATE TRIGGER {trigger_name}
                BEFORE {operation} ON {table}
                WHEN {condition}
                BEGIN
                    SELECT RAISE(ABORT, '{message}');
                END
                """
            )


_ORDER_COLUMN_ADDITIONS = {
    "payment_method": "VARCHAR(20) NOT NULL DEFAULT 'wechat'",
    "pickup_code": "VARCHAR(10) NULL",
    "fulfillment_status": "VARCHAR(20) NOT NULL DEFAULT 'waiting'",
}

_ORDERS_TABLE_DDL = """
    CREATE TABLE orders__new (
        order_id INTEGER NOT NULL PRIMARY KEY,
        order_date DATETIME NOT NULL,
        total_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
        payment_method VARCHAR(20) NOT NULL DEFAULT 'wechat',
        payment_status VARCHAR(30) NOT NULL DEFAULT 'pending',
        fulfillment_status VARCHAR(20) NOT NULL DEFAULT 'waiting',
        pickup_code VARCHAR(10),
        pickup_time TIME,
        customer_id INTEGER NOT NULL,
        employee_id INTEGER,
        CONSTRAINT ck_order_total_nonnegative CHECK (total_amount >= 0),
        CONSTRAINT ck_order_payment_method CHECK (
            payment_method IN ('cash', 'wechat', 'alipay', 'card', 'balance', 'pay_later')
        ),
        CONSTRAINT ck_order_payment_status CHECK (
            payment_status IN ('pending', 'paid', 'failed', 'refunded', 'cancelled')
        ),
        CONSTRAINT ck_order_fulfillment_status CHECK (fulfillment_status IN ('waiting', 'done')),
        FOREIGN KEY(customer_id) REFERENCES customers (customer_id) ON DELETE RESTRICT,
        FOREIGN KEY(employee_id) REFERENCES employees (employee_id) ON DELETE SET NULL
    )
"""


def _ensure_orders_table(engine: Engine) -> None:
    """Add missing order columns and widen the payment-method CHECK constraint.

    Runs on a dedicated sqlite3 connection with foreign keys disabled so the
    rebuild cannot cascade into ``order_items``.
    """
    database = engine.url.database
    if not database or database == ":memory:":
        return

    connection = sqlite3.connect(database)
    try:
        connection.execute("PRAGMA foreign_keys=OFF")
        existing = {row[1] for row in connection.execute("PRAGMA table_info(orders)")}
        if not existing:
            return

        for column, definition in _ORDER_COLUMN_ADDITIONS.items():
            if column not in existing:
                connection.execute(f"ALTER TABLE orders ADD COLUMN {column} {definition}")

        create_sql = connection.execute(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='orders'"
        ).fetchone()
        if create_sql and "balance" in (create_sql[0] or ""):
            connection.commit()
            return

        connection.execute(_ORDERS_TABLE_DDL)
        connection.execute(
            """
            INSERT INTO orders__new (
                order_id, order_date, total_amount, payment_method, payment_status,
                fulfillment_status, pickup_code, pickup_time, customer_id, employee_id
            )
            SELECT
                order_id, order_date, total_amount, payment_method, payment_status,
                COALESCE(fulfillment_status, 'waiting'), pickup_code, pickup_time,
                customer_id, employee_id
            FROM orders
            """
        )
        connection.execute("DROP TABLE orders")
        connection.execute("ALTER TABLE orders__new RENAME TO orders")
        connection.execute(
            "CREATE INDEX IF NOT EXISTS ix_orders_customer_id ON orders (customer_id)"
        )
        connection.execute(
            "CREATE INDEX IF NOT EXISTS ix_orders_employee_id ON orders (employee_id)"
        )
        connection.execute(
            "CREATE INDEX IF NOT EXISTS ix_orders_order_id ON orders (order_id)"
        )
        connection.commit()
    finally:
        connection.close()


def _ensure_product_image_url_column(connection) -> None:
    """Add the image_url column to a pre-existing products table if missing."""
    rows = connection.exec_driver_sql("PRAGMA table_info(products)").fetchall()
    existing = {r[1] for r in rows}
    if "image_url" not in existing:
        connection.exec_driver_sql("ALTER TABLE products ADD COLUMN image_url TEXT NULL")


def _ensure_customer_account_columns(connection) -> None:
    """Add wallet / staff / OAuth columns to a pre-existing customers table."""
    rows = connection.exec_driver_sql("PRAGMA table_info(customers)").fetchall()
    existing = {r[1] for r in rows}
    additions = {
        "balance": "ALTER TABLE customers ADD COLUMN balance NUMERIC(10, 2) NOT NULL DEFAULT 0",
        "role": "ALTER TABLE customers ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'customer'",
        "permissions": "ALTER TABLE customers ADD COLUMN permissions TEXT NOT NULL DEFAULT ''",
        "blocked": "ALTER TABLE customers ADD COLUMN blocked INTEGER NOT NULL DEFAULT 0",
        "auth_provider": (
            "ALTER TABLE customers ADD COLUMN auth_provider VARCHAR(20) NOT NULL DEFAULT 'email'"
        ),
        "seiue_id": "ALTER TABLE customers ADD COLUMN seiue_id INTEGER NULL",
        "feishu_open_id": "ALTER TABLE customers ADD COLUMN feishu_open_id VARCHAR(100) NULL",
        "wechat_open_id": "ALTER TABLE customers ADD COLUMN wechat_open_id VARCHAR(100) NULL",
    }
    for column, statement in additions.items():
        if column not in existing:
            connection.exec_driver_sql(statement)


def _ensure_order_item_variant_columns(connection) -> None:
    """Add the size/type and temperature snapshot columns to order_items."""
    rows = connection.exec_driver_sql("PRAGMA table_info(order_items)").fetchall()
    if not rows:
        return
    existing = {r[1] for r in rows}
    additions = {
        "variant_id": "ALTER TABLE order_items ADD COLUMN variant_id INTEGER NULL",
        "variant_name": "ALTER TABLE order_items ADD COLUMN variant_name VARCHAR(60) NULL",
        "temperature_variant_id": (
            "ALTER TABLE order_items ADD COLUMN temperature_variant_id INTEGER NULL"
        ),
        "temperature_name": (
            "ALTER TABLE order_items ADD COLUMN temperature_name VARCHAR(60) NULL"
        ),
    }
    for column, statement in additions.items():
        if column not in existing:
            connection.exec_driver_sql(statement)


def _ensure_product_variant_group_column(connection) -> None:
    """Add the variant group column (Size / Temperature) to product_variants."""
    rows = connection.exec_driver_sql("PRAGMA table_info(product_variants)").fetchall()
    if not rows:
        return
    existing = {r[1] for r in rows}
    if "group_name" not in existing:
        connection.exec_driver_sql(
            "ALTER TABLE product_variants ADD COLUMN group_name VARCHAR(40) "
            "NOT NULL DEFAULT 'Size'"
        )



