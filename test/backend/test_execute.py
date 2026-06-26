import pytest
from unittest.mock import AsyncMock, MagicMock

from app.mcp_tools.dispatcher import ToolExecutionError, execute_tool
from app.mcp_tools.schemas import FetchAssignmentsAction


@pytest.mark.asyncio
async def test_unknown_course():
    db = AsyncMock()
    db.scalar.return_value = None

    user = MagicMock(id=1)
    action = FetchAssignmentsAction(local_course_id=999)

    with pytest.raises(ToolExecutionError) as exc_info:
        await execute_tool(db, user, action)

    assert "could not be found" in exc_info.value.user_message