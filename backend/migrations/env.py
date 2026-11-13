import os
import sys
from logging.config import fileConfig

from alembic import context
from dotenv import load_dotenv
from sqlalchemy import engine_from_config, pool

# -----------------------------------------------------
# 0. Paths (backend/ and backend/app)
# -----------------------------------------------------
BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
APP_DIR = os.path.join(BACKEND_DIR, "app")

sys.path.insert(0, BACKEND_DIR)
sys.path.insert(0, APP_DIR)

# -----------------------------------------------------
# 1. Load .env from project root
# -----------------------------------------------------
PROJECT_ROOT = os.path.abspath(os.path.join(BACKEND_DIR, ".."))
env_path = os.path.join(PROJECT_ROOT, ".env")
load_dotenv(env_path)

# -----------------------------------------------------
# 2. Alembic config
# -----------------------------------------------------
config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# -----------------------------------------------------
# 3. Database URL (NO Settings dependency)
# -----------------------------------------------------
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_HOST = os.getenv("DB_HOST")
DB_PORT = os.getenv("DB_PORT")
DB_NAME = os.getenv("DB_NAME")

database_url = (
    f"mysql+mysqlconnector://{DB_USER}:{DB_PASSWORD}"
    f"@{DB_HOST}:{DB_PORT}/{DB_NAME}"
    f"?ssl_disabled=true"
)

config.set_main_option("sqlalchemy.url", database_url)

# -----------------------------------------------------
# 4. Metadata
# -----------------------------------------------------
from database import Base
from models.auth_login_attempt import AuthLoginAttempt
from models.bank_account import BankAccount
from models.credit_card import CreditCard
from models.credit_card_spending_limit import CreditCardSpendingLimit
from models.dream import Dream, DreamHabitLink, DreamMilestone
from models.expense import Expense
from models.expense_category import ExpenseCategory
from models.investment import Investment
from models.investment_income import InvestmentIncome
from models.investment_price_history import InvestmentPriceHistory
from models.patrimony_snapshot import PatrimonySnapshot
from models.patrimony_snapshot_account import PatrimonySnapshotAccount
from models.quote import Quote
from models.reading_list_book import ReadingListBook
from models.reading_list_log import ReadingListLog
from models.user import User

target_metadata = Base.metadata


# -----------------------------------------------------
# 5. Offline migrations
# -----------------------------------------------------
def run_migrations_offline() -> None:
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


# -----------------------------------------------------
# 6. Online migrations
# -----------------------------------------------------
def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
        )

        with context.begin_transaction():
            context.run_migrations()


# -----------------------------------------------------
# 7. Run
# -----------------------------------------------------
if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
