"""
Testes de segurança com autenticação real (sem override de get_current_user).

Cobrem: validação de JWT, autorização por papel, isolamento de dados entre
usuários, enumeração de usuários no login e mass assignment no registro.
"""

from datetime import datetime, timedelta, timezone

import database as app_db
import pytest
from core.security import (
    ALGORITHM,
    SECRET_KEY,
    create_access_token,
    create_email_verification_token,
    hash_password,
)
from database import get_db
from fastapi.testclient import TestClient
from jose import jwt
from main import app
from models.user import User

PASSWORD = "Correct1!"
PROTECTED_ROUTE = "/notes"
ADMIN_ROUTE = "/admin/users/"


# ============================================================================
# Fixtures
# ============================================================================
@pytest.fixture
def real_auth_client(engine, db_sessionmaker, monkeypatch):
    """TestClient que usa o banco de teste mas valida tokens de verdade."""
    monkeypatch.setattr(app_db, "engine", engine)
    monkeypatch.setattr(app_db, "SessionLocal", db_sessionmaker)

    def override_get_db():
        db = db_sessionmaker()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    try:
        with TestClient(app) as c:
            yield c
    finally:
        app.dependency_overrides.clear()


def _create_user(
    db_sessionmaker,
    *,
    username: str,
    role: str = "user",
    is_active: bool = True,
    is_verified: bool = True,
) -> int:
    session = db_sessionmaker()
    user = User(
        username=username,
        email=f"{username}@example.com",
        password_hash=hash_password(PASSWORD),
        role=role,
        is_active=is_active,
        is_verified=is_verified,
    )
    session.add(user)
    session.commit()
    user_id = user.id
    session.close()
    return user_id


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _token_for(user_id: int, role: str = "user") -> str:
    return create_access_token({"sub": str(user_id), "role": role})


# ============================================================================
# JWT
# ============================================================================
def test_protected_route_requires_token(real_auth_client):
    r = real_auth_client.get(PROTECTED_ROUTE)
    assert r.status_code in (401, 403)


def test_valid_token_is_accepted(real_auth_client, db_sessionmaker):
    user_id = _create_user(db_sessionmaker, username="valid")
    r = real_auth_client.get(PROTECTED_ROUTE, headers=_auth(_token_for(user_id)))
    assert r.status_code == 200


@pytest.mark.parametrize(
    "header",
    [
        "Bearer not-a-jwt",
        "Bearer ",
        "Basic dXNlcjpwYXNz",
        "Bearer a.b.c",
    ],
)
def test_malformed_authorization_is_rejected(real_auth_client, header):
    r = real_auth_client.get(PROTECTED_ROUTE, headers={"Authorization": header})
    assert r.status_code in (401, 403)


def test_token_signed_with_other_key_is_rejected(real_auth_client, db_sessionmaker):
    user_id = _create_user(db_sessionmaker, username="forged")
    forged = jwt.encode(
        {
            "sub": str(user_id),
            "type": "access",
            "exp": datetime.now(timezone.utc) + timedelta(minutes=5),
        },
        "chave-de-um-atacante",
        algorithm=ALGORITHM,
    )
    r = real_auth_client.get(PROTECTED_ROUTE, headers=_auth(forged))
    assert r.status_code == 401


def test_unsigned_alg_none_token_is_rejected(real_auth_client, db_sessionmaker):
    user_id = _create_user(db_sessionmaker, username="algnone")
    unsigned = jwt.encode(
        {"sub": str(user_id), "type": "access"}, "", algorithm=ALGORITHM
    )
    header, payload, _ = unsigned.split(".")
    none_header = "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0"  # {"alg":"none","typ":"JWT"}
    token = f"{none_header}.{payload}."
    assert header != none_header

    r = real_auth_client.get(PROTECTED_ROUTE, headers=_auth(token))
    assert r.status_code == 401


def test_expired_token_is_rejected(real_auth_client, db_sessionmaker):
    user_id = _create_user(db_sessionmaker, username="expired")
    expired = jwt.encode(
        {
            "sub": str(user_id),
            "type": "access",
            "exp": datetime.now(timezone.utc) - timedelta(seconds=1),
        },
        SECRET_KEY,
        algorithm=ALGORITHM,
    )
    r = real_auth_client.get(PROTECTED_ROUTE, headers=_auth(expired))
    assert r.status_code == 401


@pytest.mark.parametrize("sub", [None, "", "abc", "1 OR 1=1"])
def test_token_with_invalid_sub_is_rejected(real_auth_client, sub):
    claims = {
        "type": "access",
        "exp": datetime.now(timezone.utc) + timedelta(minutes=5),
    }
    if sub is not None:
        claims["sub"] = sub
    token = jwt.encode(claims, SECRET_KEY, algorithm=ALGORITHM)

    r = real_auth_client.get(PROTECTED_ROUTE, headers=_auth(token))
    assert r.status_code == 401


def test_token_for_nonexistent_user_is_rejected(real_auth_client):
    r = real_auth_client.get(PROTECTED_ROUTE, headers=_auth(_token_for(9999)))
    assert r.status_code == 401


def test_email_verification_token_cannot_be_used_as_access_token(
    real_auth_client, db_sessionmaker
):
    user_id = _create_user(db_sessionmaker, username="verifytok")
    verify_token = create_email_verification_token(user_id)

    r = real_auth_client.get(PROTECTED_ROUTE, headers=_auth(verify_token))
    assert r.status_code == 401


def test_access_token_cannot_be_used_to_verify_email(real_auth_client, db_sessionmaker):
    user_id = _create_user(db_sessionmaker, username="unverif", is_verified=False)

    r = real_auth_client.get(
        "/auth/verify-email", params={"token": _token_for(user_id)}
    )
    assert r.status_code == 400

    session = db_sessionmaker()
    assert session.get(User, user_id).is_verified is False
    session.close()


def test_deactivated_user_token_is_rejected(real_auth_client, db_sessionmaker):
    user_id = _create_user(db_sessionmaker, username="inactive", is_active=False)
    r = real_auth_client.get(PROTECTED_ROUTE, headers=_auth(_token_for(user_id)))
    assert r.status_code == 401


# ============================================================================
# Autorização por papel
# ============================================================================
def test_regular_user_cannot_access_admin_routes(real_auth_client, db_sessionmaker):
    user_id = _create_user(db_sessionmaker, username="regular")
    headers = _auth(_token_for(user_id))

    assert real_auth_client.get(ADMIN_ROUTE, headers=headers).status_code == 403
    assert (
        real_auth_client.put(
            f"/admin/users/{user_id}", json={"role": "admin"}, headers=headers
        ).status_code
        == 403
    )
    assert (
        real_auth_client.delete(f"/admin/users/{user_id}", headers=headers).status_code
        == 403
    )

    session = db_sessionmaker()
    assert session.get(User, user_id).role == "user"
    session.close()


def test_role_claim_in_token_does_not_grant_admin(real_auth_client, db_sessionmaker):
    """O papel vem do banco, não do claim 'role' do token."""
    user_id = _create_user(db_sessionmaker, username="claimadmin")
    token = _token_for(user_id, role="admin")

    r = real_auth_client.get(ADMIN_ROUTE, headers=_auth(token))
    assert r.status_code == 403


def test_admin_can_access_admin_routes(real_auth_client, db_sessionmaker):
    admin_id = _create_user(db_sessionmaker, username="theadmin", role="admin")
    r = real_auth_client.get(ADMIN_ROUTE, headers=_auth(_token_for(admin_id, "admin")))
    assert r.status_code == 200


def test_admin_routes_require_token(real_auth_client):
    assert real_auth_client.get(ADMIN_ROUTE).status_code in (401, 403)


# ============================================================================
# Isolamento de dados entre usuários (IDOR)
# ============================================================================
def test_user_cannot_read_update_or_delete_other_user_note(
    real_auth_client, db_sessionmaker
):
    owner = _auth(_token_for(_create_user(db_sessionmaker, username="owner")))
    intruder = _auth(_token_for(_create_user(db_sessionmaker, username="intruder")))

    created = real_auth_client.post(
        "/notes", json={"title": "Privada", "content": "segredo"}, headers=owner
    )
    assert created.status_code == 201
    note_id = created.json()["id"]

    assert (
        real_auth_client.get(f"/notes/{note_id}", headers=intruder).status_code == 404
    )
    assert (
        real_auth_client.patch(
            f"/notes/{note_id}", json={"content": "hackeado"}, headers=intruder
        ).status_code
        == 404
    )
    assert (
        real_auth_client.delete(f"/notes/{note_id}", headers=intruder).status_code
        == 404
    )

    listed = real_auth_client.get("/notes", headers=intruder)
    assert listed.status_code == 200
    assert listed.json() == []

    still_there = real_auth_client.get(f"/notes/{note_id}", headers=owner)
    assert still_there.status_code == 200
    assert still_there.json()["content"] == "segredo"


# ============================================================================
# Login e registro
# ============================================================================
def test_login_does_not_reveal_whether_email_exists(real_auth_client, db_sessionmaker):
    _create_user(db_sessionmaker, username="enum")

    unknown = real_auth_client.post(
        "/auth/login", json={"email": "ninguem@example.com", "password": PASSWORD}
    )
    wrong_pw = real_auth_client.post(
        "/auth/login", json={"email": "enum@example.com", "password": "Wrong1!x"}
    )

    assert unknown.status_code == wrong_pw.status_code == 401
    assert unknown.json() == wrong_pw.json()


def test_login_does_not_reveal_deactivated_account_without_password(
    real_auth_client, db_sessionmaker
):
    _create_user(db_sessionmaker, username="disabled", is_active=False)

    r = real_auth_client.post(
        "/auth/login", json={"email": "disabled@example.com", "password": "Wrong1!x"}
    )
    assert r.status_code == 401


def test_login_response_does_not_leak_password_hash(real_auth_client, db_sessionmaker):
    _create_user(db_sessionmaker, username="leak")

    r = real_auth_client.post(
        "/auth/login", json={"email": "leak@example.com", "password": PASSWORD}
    )
    assert r.status_code == 200
    assert "password" not in r.text
    assert "$2b$" not in r.text  # prefixo de hash bcrypt


@pytest.mark.parametrize(
    "email",
    [
        "' OR '1'='1",
        "admin@example.com' --",
        "a@b.com; DROP TABLE users;",
    ],
)
def test_login_sql_injection_payloads_do_not_authenticate(
    real_auth_client, db_sessionmaker, email
):
    _create_user(db_sessionmaker, username="admin", role="admin")

    r = real_auth_client.post(
        "/auth/login", json={"email": email, "password": "' OR '1'='1"}
    )
    assert r.status_code in (401, 422)
    assert "access_token" not in r.text


def test_register_ignores_role_from_payload(real_auth_client, monkeypatch):
    from services.email_service import EmailService

    monkeypatch.setattr(
        EmailService, "send_verification_email", staticmethod(lambda *a, **k: None)
    )

    r = real_auth_client.post(
        "/auth/register",
        json={
            "username": "escalador",
            "email": "escalador@example.com",
            "password": PASSWORD,
            "confirm_password": PASSWORD,
            "role": "admin",
        },
    )
    assert r.status_code == 201
    assert r.json()["user"]["role"] == "user"
    assert r.json()["user"]["is_verified"] is False
