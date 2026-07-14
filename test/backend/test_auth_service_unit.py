"""Direct unit tests for services/auth.py."""
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

import pytest
from fastapi import HTTPException

from app.core.security import hash_password
from app.schemas.auth import (
    ChangePasswordRequest,
    NotificationSettingsUpdate,
    PasswordResetConfirmRequest,
    ProfileUpdateRequest,
    RegisterRequest,
)
from app.services.auth import (
    admin_login_user,
    change_password,
    confirm_password_reset,
    delete_account,
    get_notification_settings,
    list_user_sessions,
    login_user,
    logout_admin,
    logout_user,
    register_user,
    remove_canvas_connection,
    request_password_reset,
    revoke_user_session,
    update_canvas_token,
    update_notification_settings,
    update_profile,
)


def _db_assigning_ids() -> AsyncMock:
    db = AsyncMock()
    created: list = []
    db.add = Mock(side_effect=created.append)
    return db


def _issue_token_patch():
    return patch(
        "app.services.auth.issue_token_for_user",
        new=AsyncMock(return_value=("fake-jwt", SimpleNamespace(id=1))),
    )


# ---------------------------------------------------------------------------
# register_user
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_register_user_rejects_when_self_registration_disabled():
    db = _db_assigning_ids()
    db.scalar = AsyncMock(return_value=None)
    body = RegisterRequest(name="New User", email="new@example.com", password="secret123")

    with patch(
        "app.services.auth.get_admin_settings",
        new=AsyncMock(return_value={"allow_instructor_self_registration": False}),
    ):
        with pytest.raises(HTTPException) as exc_info:
            await register_user(db, body)

    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_register_user_rejects_duplicate_email():
    db = _db_assigning_ids()
    db.scalar = AsyncMock(return_value=SimpleNamespace(id=1))
    body = RegisterRequest(name="New User", email="dup@example.com", password="secret123")

    with patch(
        "app.services.auth.get_admin_settings",
        new=AsyncMock(return_value={"allow_instructor_self_registration": True}),
    ):
        with pytest.raises(HTTPException) as exc_info:
            await register_user(db, body)

    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_register_user_success_issues_token():
    db = _db_assigning_ids()
    db.scalar = AsyncMock(return_value=None)
    body = RegisterRequest(name="New User", email="new@example.com", password="secret123")

    with (
        patch(
            "app.services.auth.get_admin_settings",
            new=AsyncMock(return_value={"allow_instructor_self_registration": True}),
        ),
        _issue_token_patch(),
    ):
        result = await register_user(db, body)

    assert result.access_token == "fake-jwt"
    db.add.assert_called_once()


# ---------------------------------------------------------------------------
# login_user
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_login_user_rejects_wrong_password():
    db = AsyncMock()
    user = SimpleNamespace(id=1, hashed_password=hash_password("correct"), is_active=True, role="instructor")
    db.scalar = AsyncMock(return_value=user)

    with pytest.raises(HTTPException) as exc_info:
        await login_user(db, "user@example.com", "wrong")

    assert exc_info.value.status_code == 401


@pytest.mark.asyncio
async def test_login_user_rejects_unknown_email():
    db = AsyncMock()
    db.scalar = AsyncMock(return_value=None)

    with pytest.raises(HTTPException) as exc_info:
        await login_user(db, "nobody@example.com", "whatever")

    assert exc_info.value.status_code == 401


@pytest.mark.asyncio
async def test_login_user_rejects_disabled_account():
    db = AsyncMock()
    user = SimpleNamespace(id=1, hashed_password=hash_password("correct"), is_active=False, role="instructor")
    db.scalar = AsyncMock(return_value=user)

    with pytest.raises(HTTPException) as exc_info:
        await login_user(db, "user@example.com", "correct")

    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_login_user_admin_writes_audit_log():
    db = _db_assigning_ids()
    user = SimpleNamespace(id=1, hashed_password=hash_password("correct"), is_active=True, role="admin", email="a@example.com")
    db.scalar = AsyncMock(return_value=user)

    with _issue_token_patch():
        result = await login_user(db, "a@example.com", "correct")

    assert result.access_token == "fake-jwt"
    db.add.assert_called_once()
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_login_user_instructor_does_not_write_audit_log():
    db = _db_assigning_ids()
    user = SimpleNamespace(id=1, hashed_password=hash_password("correct"), is_active=True, role="instructor", email="i@example.com")
    db.scalar = AsyncMock(return_value=user)

    with _issue_token_patch():
        await login_user(db, "i@example.com", "correct")

    db.add.assert_not_called()


# ---------------------------------------------------------------------------
# admin_login_user
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_admin_login_user_rejects_unknown_email():
    db = AsyncMock()
    db.scalar = AsyncMock(return_value=None)

    with pytest.raises(HTTPException) as exc_info:
        await admin_login_user(db, "nobody@example.com", "whatever")

    assert exc_info.value.status_code == 401


@pytest.mark.asyncio
async def test_admin_login_user_rejects_non_admin():
    db = AsyncMock()
    user = SimpleNamespace(id=1, hashed_password=hash_password("correct"), is_active=True, role="instructor")
    db.scalar = AsyncMock(return_value=user)

    with pytest.raises(HTTPException) as exc_info:
        await admin_login_user(db, "i@example.com", "correct")

    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_admin_login_user_rejects_disabled_admin():
    db = AsyncMock()
    user = SimpleNamespace(id=1, hashed_password=hash_password("correct"), is_active=False, role="admin")
    db.scalar = AsyncMock(return_value=user)

    with pytest.raises(HTTPException) as exc_info:
        await admin_login_user(db, "a@example.com", "correct")

    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_admin_login_user_success():
    db = _db_assigning_ids()
    user = SimpleNamespace(id=1, hashed_password=hash_password("correct"), is_active=True, role="admin", email="a@example.com")
    db.scalar = AsyncMock(return_value=user)

    with _issue_token_patch():
        result = await admin_login_user(db, "a@example.com", "correct")

    assert result.access_token == "fake-jwt"
    db.add.assert_called_once()


# ---------------------------------------------------------------------------
# logout_user / logout_admin
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_logout_user_revokes_session():
    db = AsyncMock()
    with patch("app.services.auth.revoke_session", new=AsyncMock()) as mock_revoke:
        await logout_user(db, "some-token")
    mock_revoke.assert_awaited_once_with(db, "some-token")


@pytest.mark.asyncio
async def test_logout_admin_revokes_session_and_audits():
    db = _db_assigning_ids()
    user = SimpleNamespace(id=1, email="a@example.com")
    with patch("app.services.auth.revoke_session", new=AsyncMock()):
        await logout_admin(db, "some-token", user)
    db.add.assert_called_once()
    db.commit.assert_awaited_once()


# ---------------------------------------------------------------------------
# update_profile
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_update_profile_rejects_conflicting_email():
    db = AsyncMock()
    user = SimpleNamespace(id=1, email="old@example.com", name="Old")
    db.scalar = AsyncMock(return_value=SimpleNamespace(id=2))

    with pytest.raises(HTTPException) as exc_info:
        await update_profile(db, user, ProfileUpdateRequest(email="taken@example.com"))

    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_update_profile_rejects_empty_name():
    db = AsyncMock()
    user = SimpleNamespace(id=1, email="old@example.com", name="Old")

    with pytest.raises(HTTPException) as exc_info:
        await update_profile(db, user, ProfileUpdateRequest(name="   "))

    assert exc_info.value.status_code == 422


@pytest.mark.asyncio
async def test_update_profile_success_updates_name_and_email():
    db = _db_assigning_ids()
    user = SimpleNamespace(id=1, email="old@example.com", name="Old")
    db.scalar = AsyncMock(side_effect=[None, SimpleNamespace(id=1, email="new@example.com", name="New")])

    result = await update_profile(
        db, user, ProfileUpdateRequest(name="New", email="new@example.com")
    )

    assert user.name == "New"
    assert user.email == "new@example.com"
    assert result.email == "new@example.com"
    db.add.assert_called_once()


# ---------------------------------------------------------------------------
# delete_account / change_password
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_delete_account_rejects_wrong_password():
    db = AsyncMock()
    user = SimpleNamespace(id=1, hashed_password=hash_password("correct"), email="a@example.com")

    with pytest.raises(HTTPException) as exc_info:
        await delete_account(db, user, "wrong")

    assert exc_info.value.status_code == 401


@pytest.mark.asyncio
async def test_delete_account_success_deactivates_and_purges_sessions():
    db = _db_assigning_ids()
    user = SimpleNamespace(id=1, hashed_password=hash_password("correct"), email="a@example.com", is_active=True)

    await delete_account(db, user, "correct")

    assert user.is_active is False
    assert db.execute.await_count == 2
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_change_password_rejects_wrong_current_password():
    db = AsyncMock()
    user = SimpleNamespace(id=1, hashed_password=hash_password("correct"))

    with pytest.raises(HTTPException) as exc_info:
        await change_password(db, user, ChangePasswordRequest(current_password="wrong", new_password="newsecret123"))

    assert exc_info.value.status_code == 401


@pytest.mark.asyncio
async def test_change_password_success():
    db = _db_assigning_ids()
    user = SimpleNamespace(id=1, hashed_password=hash_password("correct"))

    await change_password(db, user, ChangePasswordRequest(current_password="correct", new_password="newsecret123"))

    assert user.hashed_password != hash_password("correct")
    db.add.assert_called_once()


# ---------------------------------------------------------------------------
# request_password_reset / confirm_password_reset
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_request_password_reset_returns_none_for_unknown_email():
    db = AsyncMock()
    db.scalar = AsyncMock(return_value=None)

    result = await request_password_reset(db, "nobody@example.com")

    assert result is None
    db.commit.assert_not_called()


@pytest.mark.asyncio
async def test_request_password_reset_creates_token_for_known_user():
    db = _db_assigning_ids()
    db.scalar = AsyncMock(return_value=SimpleNamespace(id=1))

    result = await request_password_reset(db, "a@example.com")

    assert isinstance(result, str) and len(result) > 0
    db.add.assert_called_once()


@pytest.mark.asyncio
async def test_confirm_password_reset_rejects_invalid_or_expired_token():
    db = AsyncMock()
    db.scalar = AsyncMock(return_value=None)

    with pytest.raises(HTTPException) as exc_info:
        await confirm_password_reset(db, PasswordResetConfirmRequest(token="bad-token", new_password="newsecret123"))

    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_confirm_password_reset_rejects_missing_user():
    db = AsyncMock()
    token_row = SimpleNamespace(user_id=99, used_at=None)
    db.scalar = AsyncMock(return_value=token_row)
    db.get = AsyncMock(return_value=None)

    with pytest.raises(HTTPException) as exc_info:
        await confirm_password_reset(db, PasswordResetConfirmRequest(token="tok", new_password="newsecret123"))

    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_confirm_password_reset_success():
    db = _db_assigning_ids()
    token_row = SimpleNamespace(user_id=1, used_at=None)
    user = SimpleNamespace(id=1, hashed_password=hash_password("old"))
    db.scalar = AsyncMock(return_value=token_row)
    db.get = AsyncMock(return_value=user)

    await confirm_password_reset(db, PasswordResetConfirmRequest(token="tok", new_password="newsecret123"))

    assert user.hashed_password != hash_password("old")
    assert token_row.used_at is not None
    db.add.assert_called_once()
    assert db.execute.await_count == 1


# ---------------------------------------------------------------------------
# notification settings
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_notification_settings_returns_empty_dict_when_no_preference_row():
    db = AsyncMock()
    db.scalar = AsyncMock(return_value=None)
    user = SimpleNamespace(id=1)

    result = await get_notification_settings(db, user)

    assert result == {}


@pytest.mark.asyncio
async def test_get_notification_settings_returns_stored_settings():
    db = AsyncMock()
    db.scalar = AsyncMock(return_value=SimpleNamespace(notification_settings={"email": True}))
    user = SimpleNamespace(id=1)

    result = await get_notification_settings(db, user)

    assert result == {"email": True}


@pytest.mark.asyncio
async def test_update_notification_settings_creates_preference_row_when_missing():
    db = _db_assigning_ids()
    db.scalar = AsyncMock(return_value=None)
    user = SimpleNamespace(id=1)

    result = await update_notification_settings(
        db, user, NotificationSettingsUpdate(settings={"email": False})
    )

    assert result == {"email": False}
    db.add.assert_called_once()


@pytest.mark.asyncio
async def test_update_notification_settings_updates_existing_row():
    db = AsyncMock()
    pref = SimpleNamespace(notification_settings={"email": True}, updated_at=None)
    db.scalar = AsyncMock(return_value=pref)
    user = SimpleNamespace(id=1)

    result = await update_notification_settings(
        db, user, NotificationSettingsUpdate(settings={"email": False})
    )

    assert result == {"email": False}
    assert pref.updated_at is not None


# ---------------------------------------------------------------------------
# sessions
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_list_user_sessions_marks_current_session():
    db = AsyncMock()
    from app.core.security import hash_token

    current_token = "current-token"
    rows = [
        SimpleNamespace(id=1, created_at="t1", expires_at="e1", token_hash=hash_token(current_token)),
        SimpleNamespace(id=2, created_at="t2", expires_at="e2", token_hash="different-hash"),
    ]
    db.scalars = AsyncMock(return_value=rows)
    user = SimpleNamespace(id=1)

    result = await list_user_sessions(db, user, current_token)

    assert result[0]["is_current"] is True
    assert result[1]["is_current"] is False


@pytest.mark.asyncio
async def test_revoke_user_session_not_found_raises_404():
    db = AsyncMock()
    db.scalar = AsyncMock(return_value=None)
    user = SimpleNamespace(id=1)

    with pytest.raises(HTTPException) as exc_info:
        await revoke_user_session(db, user, 999)

    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_revoke_user_session_success():
    db = AsyncMock()
    session = SimpleNamespace(id=5)
    db.scalar = AsyncMock(return_value=session)
    user = SimpleNamespace(id=1)

    await revoke_user_session(db, user, 5)

    db.delete.assert_awaited_once_with(session)
    db.commit.assert_awaited_once()


# ---------------------------------------------------------------------------
# canvas connection management
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_remove_canvas_connection_not_found_raises_404():
    db = AsyncMock()
    db.scalar = AsyncMock(return_value=None)
    user = SimpleNamespace(id=1)

    with pytest.raises(HTTPException) as exc_info:
        await remove_canvas_connection(db, user, 999)

    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_remove_canvas_connection_success():
    db = AsyncMock()
    conn = SimpleNamespace(id=5)
    db.scalar = AsyncMock(return_value=conn)
    user = SimpleNamespace(id=1)

    await remove_canvas_connection(db, user, 5)

    db.delete.assert_awaited_once_with(conn)
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_update_canvas_token_creates_new_connection():
    db = _db_assigning_ids()
    db.scalar = AsyncMock(side_effect=[None, SimpleNamespace(id=1)])
    user = SimpleNamespace(id=1)

    with (
        patch("app.services.auth.validate_token", new=AsyncMock()),
        patch("app.services.auth.encrypt_canvas_token", return_value="encrypted-token"),
    ):
        result = await update_canvas_token(db, user, "raw-token", "https://canvas.ubc.ca")

    db.add.assert_called_once()
    assert result.id == 1


@pytest.mark.asyncio
async def test_update_canvas_token_replaces_existing_connection_token():
    db = _db_assigning_ids()
    existing = SimpleNamespace(id=9, encrypted_token="old-encrypted")
    db.scalar = AsyncMock(side_effect=[existing, SimpleNamespace(id=1)])
    user = SimpleNamespace(id=1)

    with (
        patch("app.services.auth.validate_token", new=AsyncMock()),
        patch("app.services.auth.encrypt_canvas_token", return_value="new-encrypted"),
    ):
        await update_canvas_token(db, user, "raw-token", "https://canvas.ubc.ca")

    assert existing.encrypted_token == "new-encrypted"
    db.add.assert_not_called()
