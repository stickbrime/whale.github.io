"""Repair legacy SQLite rows and protect typed columns from direct corruption.

FastAPI/Pydantic validates every API request, but SQLite's dynamic typing still allows a
database editor (or raw SQL) to place arbitrary text in DATE/TIME columns. SQLAlchemy
then correctly refuses to deserialize those values. These startup checks repair legacy
rows and triggers prevent the same corruption from being written again.
"""

from sqlalchemy.engine import Engine


def prepare_database(engine: Engine) -> None:
    """Repair known malformed SQLite values and install direct-write safeguards."""
    if engine.dialect.name != "sqlite":
        return

    with engine.begin() as connection:
        _migrate_sqlite_schema(connection)
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

        _install_validation_triggers(connection)


def _migrate_sqlite_schema(connection) -> None:
    """Add post-ER features to existing local databases without deleting user data."""
    customer_columns = {
        row[1] for row in connection.exec_driver_sql("PRAGMA table_info(customers)").fetchall()
    }
    order_columns = {
        row[1] for row in connection.exec_driver_sql("PRAGMA table_info(orders)").fetchall()
    }
    if "seiue_id" not in customer_columns:
        connection.exec_driver_sql("ALTER TABLE customers ADD COLUMN seiue_id INTEGER")
    for column, sql_type in (
        ("credit_days", "INTEGER"),
        ("credit_due_at", "DATETIME"),
        ("paid_at", "DATETIME"),
    ):
        if column not in order_columns:
            connection.exec_driver_sql(f"ALTER TABLE orders ADD COLUMN {column} {sql_type}")
    connection.exec_driver_sql(
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_customers_seiue_id ON customers(seiue_id)"
    )
    connection.exec_driver_sql(
        "CREATE INDEX IF NOT EXISTS ix_orders_credit_due_at ON orders(credit_due_at)"
    )


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
    """

    for table, condition, message in (
        ("customers", customer_validation, "invalid customer data"),
        ("employees", employee_validation, "invalid employee data"),
        ("orders", order_validation, "invalid order date, time, or status"),
    ):
        for operation in ("INSERT", "UPDATE"):
            trigger_name = f"validate_{table}_{operation.lower()}"
            connection.exec_driver_sql(
                f"""
                CREATE TRIGGER IF NOT EXISTS {trigger_name}
                BEFORE {operation} ON {table}
                WHEN {condition}
                BEGIN
                    SELECT RAISE(ABORT, '{message}');
                END
                """
            )
