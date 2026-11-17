from decimal import Decimal

ZERO = Decimal("0")
CENT = Decimal("0.01")


def format_brl(value: Decimal | int | float | None) -> str:
    """Formata um valor como moeda brasileira: ``R$ 1.234,56``."""
    amount = Decimal(value or ZERO).quantize(CENT)
    formatted = f"{abs(amount):,.2f}".replace(",", "X").replace(".", ",")
    formatted = formatted.replace("X", ".")
    prefix = "-R$ " if amount < ZERO else "R$ "
    return f"{prefix}{formatted}"
