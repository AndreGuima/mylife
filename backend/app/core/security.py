import re
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from jose import JWTError, jwt
from passlib.context import CryptContext
from settings import settings

# ============================================================
# 🔐 JWT Configuration (ENV-driven)
# ============================================================

SECRET_KEY = settings.SECRET_KEY
ALGORITHM = "HS256"

ACCESS_TOKEN_EXPIRE_MINUTES = 60
EMAIL_VERIFICATION_EXPIRE_HOURS = 24

# ============================================================
# 🔑 Password hashing
# ============================================================

pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto",
)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return pwd_context.verify(password, password_hash)


# ============================================================
# 🔐 JWT helpers (API pública do módulo)
# ============================================================


def create_access_token(data: dict) -> str:
    """
    Create JWT access token.
    """
    payload = data.copy()
    payload["type"] = "access"
    payload["exp"] = datetime.now(timezone.utc) + timedelta(
        minutes=ACCESS_TOKEN_EXPIRE_MINUTES
    )
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict:
    """
    Decode and validate JWT access token.
    Raises HTTP 401 if invalid or expired.
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido ou expirado",
        )


# ============================================================
# 📧 Email verification token
# ============================================================
def create_email_verification_token(user_id: int) -> str:
    """
    Create a JWT token for email verification.
    Compatible with /auth/verify-email endpoint.
    """
    payload = {
        "sub": str(user_id),
        "type": "verify",  # 👈 OBRIGATÓRIO
        "exp": datetime.now(timezone.utc)
        + timedelta(hours=EMAIL_VERIFICATION_EXPIRE_HOURS),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


# ============================================================
# 🔒 Password strength validation
# ============================================================


def validate_password_strength(password: str) -> None:
    errors: list[str] = []

    if len(password) < settings.PASSWORD_MIN_LENGTH:
        errors.append(f"mínimo de {settings.PASSWORD_MIN_LENGTH} caracteres")

    if settings.PASSWORD_REQUIRE_LOWER and not re.search(r"[a-z]", password):
        errors.append("uma letra minúscula")

    if settings.PASSWORD_REQUIRE_UPPER and not re.search(r"[A-Z]", password):
        errors.append("uma letra maiúscula")

    if settings.PASSWORD_REQUIRE_DIGIT and not re.search(r"\d", password):
        errors.append("um número")

    if settings.PASSWORD_REQUIRE_SPECIAL and not re.search(r"[^\w\s]", password):
        errors.append("um caractere especial")

    if errors:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"A senha deve conter: {', '.join(errors)}.",
        )


# ============================================================
# 🔐 High-level password helper (FASE 2)
# ============================================================


def validate_and_hash_password(password: str) -> str:
    """
    Valida a senha de acordo com a política configurada
    e retorna o hash seguro.

    ESTE é o método padrão para criação/alteração de senha.
    """
    validate_password_strength(password)
    return hash_password(password)
