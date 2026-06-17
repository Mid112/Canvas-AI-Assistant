from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import create_access_token, encrypt_canvas_token, hash_password, verify_password
from app.integrations.canvas import validate_token
from app.models.user import User
from app.schemas.auth import RegisterRequest, TokenResponse


async def register_user(
    db: AsyncSession, body: RegisterRequest
) -> TokenResponse:
    # Check if email is already taken
    existing = await db.scalar(select(User).where(User.email == body.email))
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )

    # Create new user — role defaults to instructor on self-registration
    # Admin accounts are created separately via admin panel
    user = User(
        name=body.name,
        email=body.email,
        hashed_password=hash_password(body.password),
        role="instructor",
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    return TokenResponse(access_token=create_access_token(user.id))


async def login_user(
    db: AsyncSession, email: str, password: str
) -> TokenResponse:
    user = await db.scalar(select(User).where(User.email == email))

    # Deliberate vague error — don't reveal whether email exists
    if not user or not verify_password(password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials"
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is disabled"
        )

    return TokenResponse(access_token=create_access_token(user.id))


async def update_canvas_token(db: AsyncSession, user: User, canvas_token: str) -> User:
    await validate_token(canvas_token)
    user.canvas_token = encrypt_canvas_token(canvas_token)
    await db.commit()
    await db.refresh(user)
    return user
