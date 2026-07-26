from unittest.mock import AsyncMock, patch

import httpx
import pytest

from app.integrations import mcp_client
from app.integrations.mcp_client import MCPClientError, call_tool


@pytest.mark.asyncio
async def test_call_tool_raises_when_disabled():
    with patch.object(mcp_client.settings, "MCP_ENABLED", False):
        with pytest.raises(MCPClientError, match="disabled"):
            await call_tool(
                "fetch_courses",
                {},
                canvas_token="token",
                canvas_url="https://canvas.ubc.ca",
            )


@pytest.mark.asyncio
async def test_call_tool_rejects_unknown_tool():
    with patch.object(mcp_client.settings, "MCP_ENABLED", True), patch.object(
        mcp_client.settings, "MCP_SERVER_URL", "http://mcp:8001"
    ), patch.object(mcp_client.settings, "MCP_SHARED_SECRET", "test-secret"):
        with pytest.raises(MCPClientError, match="not allowed"):
            await call_tool(
                "delete_everything",
                {},
                canvas_token="token",
                canvas_url="https://canvas.ubc.ca",
            )


@pytest.mark.asyncio
async def test_call_tool_requires_shared_secret():
    with patch.object(mcp_client.settings, "MCP_ENABLED", True), patch.object(
        mcp_client.settings, "MCP_SERVER_URL", "http://mcp:8001"
    ), patch.object(mcp_client.settings, "MCP_SHARED_SECRET", ""):
        with pytest.raises(MCPClientError, match="MCP_SHARED_SECRET"):
            await call_tool(
                "fetch_courses",
                {},
                canvas_token="token",
                canvas_url="https://canvas.ubc.ca",
            )


@pytest.mark.asyncio
async def test_call_tool_posts_payload_and_returns_json():
    response = httpx.Response(
        200,
        json={"courses": [{"id": 1, "name": "COSC 111"}]},
        request=httpx.Request("POST", "http://mcp:8001/tools/call"),
    )

    with patch.object(mcp_client.settings, "MCP_ENABLED", True), patch.object(
        mcp_client.settings, "MCP_SERVER_URL", "http://mcp:8001"
    ), patch.object(
        mcp_client.settings, "MCP_SHARED_SECRET", "test-secret"
    ), patch("app.integrations.mcp_client.httpx.AsyncClient") as mock_client:
        mock_client.return_value.__aenter__.return_value.post = AsyncMock(
            return_value=response
        )
        result = await call_tool(
            "fetch_courses",
            {},
            canvas_token="secret",
            canvas_url="https://canvas.ubc.ca",
        )

    assert result["courses"][0]["name"] == "COSC 111"
    mock_client.return_value.__aenter__.return_value.post.assert_awaited_once()
    await_args = mock_client.return_value.__aenter__.return_value.post.await_args
    sent_payload = await_args.kwargs["json"]
    assert sent_payload["name"] == "fetch_courses"
    assert sent_payload["canvas_token"] == "secret"
    assert await_args.kwargs["headers"]["Authorization"] == "Bearer test-secret"


@pytest.mark.asyncio
async def test_call_tool_maps_unreachable_server():
    with patch.object(mcp_client.settings, "MCP_ENABLED", True), patch.object(
        mcp_client.settings, "MCP_SERVER_URL", "http://mcp:8001"
    ), patch.object(
        mcp_client.settings, "MCP_SHARED_SECRET", "test-secret"
    ), patch("app.integrations.mcp_client.httpx.AsyncClient") as mock_client:
        mock_client.return_value.__aenter__.return_value.post = AsyncMock(
            side_effect=httpx.ConnectError("connection refused")
        )
        with pytest.raises(MCPClientError, match="unreachable"):
            await call_tool(
                "fetch_courses",
                {},
                canvas_token="secret",
                canvas_url="https://canvas.ubc.ca",
            )
