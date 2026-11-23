from decimal import Decimal

CENTS = Decimal("0.01")


def to_money(value) -> Decimal:
    """Database aggregate -> Decimal rounded to cents. PostgreSQL returns Decimal,
    SQLite returns int/float; str() avoids float noise like 1999.9999999."""
    if value is None:
        return Decimal("0.00")
    return Decimal(str(value)).quantize(CENTS)
