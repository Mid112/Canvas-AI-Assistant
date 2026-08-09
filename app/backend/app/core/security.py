import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta

from cryptography.fernet import Fernet
from jose import jwt
from passlib.context import CryptContext

from app.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(subject: str | int, role: str = "instructor") -> str:
    token, _ = create_access_token_with_expiry(subject, role=role)
    return token


def create_access_token_with_expiry(
    subject: str | int,
    role: str = "instructor",
) -> tuple[str, datetime]:
    expire = datetime.now(UTC) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": str(subject), "role": role, "exp": expire}
    token = jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    return token, expire


def decode_access_token(token: str) -> tuple[str, str]:
    payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    # role defaults to "instructor" so tokens minted before this change remain valid
    return payload["sub"], payload.get("role", "instructor")


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def generate_reset_token() -> str:
    return secrets.token_urlsafe(32)


def _fernet() -> Fernet:
    # Same Fernet key encrypts Canvas tokens and instructor LLM API keys at rest.
    return Fernet(settings.CANVAS_TOKEN_ENCRYPTION_KEY.encode())


def encrypt_canvas_token(plain_token: str) -> str:
    return _fernet().encrypt(plain_token.encode()).decode()


def decrypt_canvas_token(encrypted_token: str) -> str:
    return _fernet().decrypt(encrypted_token.encode()).decode()


def fingerprint_canvas_token(plain_token: str) -> str:
    """Return a stable, non-reversible identifier for duplicate detection.

    Fernet ciphertext is intentionally different on every encryption, so it
    cannot be used for equality checks. A keyed HMAC lets the database enforce
    uniqueness without storing or logging the raw Canvas token.
    """
    return hmac.new(
        settings.CANVAS_TOKEN_ENCRYPTION_KEY.encode(),
        plain_token.encode(),
        hashlib.sha256,
    ).hexdigest()


def encrypt_llm_api_key(plain_api_key: str) -> str:
    return _fernet().encrypt(plain_api_key.encode()).decode()


def decrypt_llm_api_key(encrypted_api_key: str) -> str:
    return _fernet().decrypt(encrypted_api_key.encode()).decode()
