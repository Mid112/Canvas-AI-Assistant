import hashlib
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
    expire = datetime.now(UTC) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": str(subject), "role": role, "exp": expire}
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> tuple[str, str]:
    payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    # role defaults to "instructor" so tokens minted before this change remain valid
    return payload["sub"], payload.get("role", "instructor")


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _fernet() -> Fernet:
    return Fernet(settings.CANVAS_TOKEN_ENCRYPTION_KEY.encode())


def encrypt_canvas_token(plain_token: str) -> str:
    return _fernet().encrypt(plain_token.encode()).decode()


def decrypt_canvas_token(encrypted_token: str) -> str:
    return _fernet().decrypt(encrypted_token.encode()).decode()
