import pytest
import httpx
import asyncio
from mcp.client.session import ClientSession
from mcp.client.streamable_http import streamable_http_client

MCP_URL = "http://localhost:8001"

def test_mcp_server_health():
    """MCP server responds to health check."""
    response = httpx.get(f"{MCP_URL}/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"

def test_mcp_list_tools():
    """MCP server exposes at least one tool."""
    async def run():
        async with streamable_http_client(f"{MCP_URL}/mcp") as (read, write, _):
            async with ClientSession(read, write) as session:
                await session.initialize()
                result = await session.list_tools()
                return result.tools

    tools = asyncio.run(run())
    assert len(tools) > 0

def test_mcp_fetch_courses_tool_exists():
    """fetch_courses tool is registered."""
    async def run():
        async with streamable_http_client(f"{MCP_URL}/mcp") as (read, write, _):
            async with ClientSession(read, write) as session:
                await session.initialize()
                result = await session.list_tools()
                return result.tools

    tools = asyncio.run(run())
    tool_names = [t.name for t in tools]
    assert "fetch_courses" in tool_names