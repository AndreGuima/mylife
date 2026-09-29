import os
import sys
import warnings
from pathlib import Path
from types import SimpleNamespace

from dotenv import load_dotenv

# ============================================================================
# Caminhos absolutos
# ============================================================================
TESTS_DIR = Path(__file__).resolve().parent  # backend/tests
APP_DIR = TESTS_DIR.parent / "app"  # backend/app
PROJECT_ROOT = TESTS_DIR.parent.parent  # repo root

# ============================================================================
# Ambiente
# ============================================================================
load_dotenv(PROJECT_ROOT / ".env")
os.environ["TESTING"] = "1"

# ============================================================================
# Warnings (dependências externas)
# ============================================================================
warnings.filterwarnings(
    "ignore",
    category=DeprecationWarning,
    module=r"jose\\.jwt",
)
warnings.filterwarnings(
    "ignore",
    category=DeprecationWarning,
    module=r"jose\\.jwt",
    message=".*utcnow.*",
)
warnings.filterwarnings(
    "ignore",
    category=DeprecationWarning,
    module=r"jose",
    message=".*utcnow.*",
)
warnings.filterwarnings(
    "ignore",
    category=DeprecationWarning,
    message=".*utcnow.*",
)

# ============================================================================
# Projeto FLAT → backend/app é o root do Python
# ============================================================================
sys.path.insert(0, str(APP_DIR))

# ============================================================================
# Imports da aplicação (flat)
# ============================================================================
import database as app_db
import pytest
from database import Base, get_db
from fastapi.testclient import TestClient
from main import app
from models.user import User
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool


# ============================================================================
# 🧪 Banco de dados SQLite em memória por teste
# ============================================================================
@pytest.fixture
def engine():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    yield engine
    Base.metadata.drop_all(bind=engine)
    engine.dispose()


@pytest.fixture
def db_sessionmaker(engine):
    return sessionmaker(
        bind=engine,
        autocommit=False,
        autoflush=False,
        expire_on_commit=False,
    )


def _prepare_client_state(
    engine, db_sessionmaker, monkeypatch, *, role: str, username: str, email: str
):
    monkeypatch.setattr(app_db, "engine", engine)
    monkeypatch.setattr(app_db, "SessionLocal", db_sessionmaker)

    def override_get_db():
        db = db_sessionmaker()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db

    test_db = db_sessionmaker()
    fake_user = User(
        id=1,
        username=username,
        email=email,
        password_hash="hashed",
        role=role,
        is_active=True,
        is_verified=True,
    )
    test_db.add(fake_user)
    test_db.commit()
    test_db.close()

    from core.dependencies import get_current_user

    fake_current_user = SimpleNamespace(
        id=1,
        username=username,
        email=email,
        role=role,
        is_active=True,
        is_verified=True,
    )

    def override_current_user():
        return fake_current_user

    app.dependency_overrides[get_current_user] = override_current_user


# ============================================================================
# 🧪 TestClient
# ============================================================================
@pytest.fixture
def client(engine, db_sessionmaker, monkeypatch):
    _prepare_client_state(
        engine,
        db_sessionmaker,
        monkeypatch,
        role="user",
        username="testuser",
        email="test@example.com",
    )

    try:
        with TestClient(app) as c:
            yield c
    finally:
        app.dependency_overrides.clear()


@pytest.fixture
def admin_client(engine, db_sessionmaker, monkeypatch):
    _prepare_client_state(
        engine,
        db_sessionmaker,
        monkeypatch,
        role="admin",
        username="admin",
        email="admin@example.com",
    )

    try:
        with TestClient(app) as c:
            yield c
    finally:
        app.dependency_overrides.clear()


@pytest.fixture
def db_session(engine, db_sessionmaker):
    """
    Sessão isolada por teste.
    Sempre faz rollback para evitar vazamento de dados.
    """
    connection = engine.connect()
    transaction = connection.begin()

    session = db_sessionmaker(bind=connection)

    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()
