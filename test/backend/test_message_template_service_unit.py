"""Direct unit tests for services/message_template.py."""
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest
from fastapi import HTTPException

from app.schemas.message_template import MessageTemplateCreate, MessageTemplateUpdate
from app.services.message_template import (
    create_message_template,
    delete_message_template,
    get_message_template,
    list_message_templates,
    update_message_template,
)


def _db_assigning_ids() -> AsyncMock:
    db = AsyncMock()
    created: list = []
    db.add = Mock(side_effect=created.append)
    db.refresh = AsyncMock()
    return db


# ---------------------------------------------------------------------------
# list_message_templates
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_list_message_templates_scoped_to_user():
    db = AsyncMock()
    templates = [SimpleNamespace(id=1), SimpleNamespace(id=2)]
    db.scalars = AsyncMock(return_value=templates)
    user = SimpleNamespace(id=1)

    result = await list_message_templates(db, user)

    assert result == templates


@pytest.mark.asyncio
async def test_list_message_templates_rejects_unowned_course():
    db = AsyncMock()
    db.scalar = AsyncMock(return_value=None)
    user = SimpleNamespace(id=1)

    with pytest.raises(HTTPException) as exc_info:
        await list_message_templates(db, user, course_id=999)

    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_list_message_templates_filters_by_owned_course():
    db = AsyncMock()
    db.scalar = AsyncMock(return_value=SimpleNamespace(id=5))
    db.scalars = AsyncMock(return_value=[])
    user = SimpleNamespace(id=1)

    result = await list_message_templates(db, user, course_id=5)

    assert result == []


# ---------------------------------------------------------------------------
# create_message_template
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_create_message_template_without_course():
    db = _db_assigning_ids()
    user = SimpleNamespace(id=1)
    body = MessageTemplateCreate(title="Reminder", content="Please submit.")

    template = await create_message_template(db, user, body)

    assert template.title == "Reminder"
    assert template.content == "Please submit."
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_create_message_template_rejects_unowned_course():
    db = AsyncMock()
    db.scalar = AsyncMock(return_value=None)
    user = SimpleNamespace(id=1)
    body = MessageTemplateCreate(title="Reminder", content="Please submit.", course_id=999)

    with pytest.raises(HTTPException) as exc_info:
        await create_message_template(db, user, body)

    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_create_message_template_rejects_whitespace_only_title():
    db = _db_assigning_ids()
    user = SimpleNamespace(id=1)
    body = MessageTemplateCreate(title="   ", content="Please submit.")

    with pytest.raises(HTTPException) as exc_info:
        await create_message_template(db, user, body)

    assert exc_info.value.status_code == 422
    assert "Title" in exc_info.value.detail


@pytest.mark.asyncio
async def test_create_message_template_rejects_whitespace_only_content():
    db = _db_assigning_ids()
    user = SimpleNamespace(id=1)
    body = MessageTemplateCreate(title="Reminder", content="   ")

    with pytest.raises(HTTPException) as exc_info:
        await create_message_template(db, user, body)

    assert exc_info.value.status_code == 422
    assert "Content" in exc_info.value.detail


# ---------------------------------------------------------------------------
# get_message_template
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_message_template_not_found_raises_404():
    db = AsyncMock()
    db.scalar = AsyncMock(return_value=None)
    user = SimpleNamespace(id=1)

    with pytest.raises(HTTPException) as exc_info:
        await get_message_template(db, user, 999)

    assert exc_info.value.status_code == 404


# ---------------------------------------------------------------------------
# update_message_template
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_update_message_template_updates_provided_fields_only():
    db = AsyncMock()
    template = SimpleNamespace(id=1, user_id=1, title="Old", content="Old content", course_id=None)
    db.scalar = AsyncMock(return_value=template)
    db.refresh = AsyncMock()
    user = SimpleNamespace(id=1)

    result = await update_message_template(db, user, 1, MessageTemplateUpdate(title="New"))

    assert result.title == "New"
    assert result.content == "Old content"


@pytest.mark.asyncio
async def test_update_message_template_rejects_unowned_course():
    db = AsyncMock()
    template = SimpleNamespace(id=1, user_id=1, title="Old", content="Old content", course_id=None)
    db.scalar = AsyncMock(side_effect=[template, None])
    user = SimpleNamespace(id=1)

    with pytest.raises(HTTPException) as exc_info:
        await update_message_template(db, user, 1, MessageTemplateUpdate(course_id=999))

    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_update_message_template_reassigns_owned_course():
    db = AsyncMock()
    template = SimpleNamespace(id=1, user_id=1, title="Old", content="Old content", course_id=None)
    db.scalar = AsyncMock(side_effect=[template, SimpleNamespace(id=5)])
    db.refresh = AsyncMock()
    user = SimpleNamespace(id=1)

    result = await update_message_template(db, user, 1, MessageTemplateUpdate(course_id=5))

    assert result.course_id == 5


# ---------------------------------------------------------------------------
# delete_message_template
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_delete_message_template_removes_owned_template():
    db = AsyncMock()
    template = SimpleNamespace(id=1, user_id=1)
    db.scalar = AsyncMock(return_value=template)
    user = SimpleNamespace(id=1)

    await delete_message_template(db, user, 1)

    db.delete.assert_awaited_once_with(template)
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_delete_message_template_not_found_raises_404():
    db = AsyncMock()
    db.scalar = AsyncMock(return_value=None)
    user = SimpleNamespace(id=1)

    with pytest.raises(HTTPException) as exc_info:
        await delete_message_template(db, user, 999)

    assert exc_info.value.status_code == 404
