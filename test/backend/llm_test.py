# test/backend/llm_test.py
import pytest
from unittest.mock import AsyncMock, patch

from app.services.llm.llm_setting import get_llm_adapter


@pytest.mark.asyncio
async def test_vllm_adapter_returns_text():
    adapter = get_llm_adapter({"provider": "vllm"})

    mock_response = AsyncMock()
    mock_response.raise_for_status = lambda: None
    mock_response.json = lambda: {
        "choices": [{"message": {"content": "hello"}}]
    }

    with patch("httpx.AsyncClient.post", return_value=mock_response):
        result = await adapter.generate(
            system_prompt="You are a helpful assistant.",
            user_message="Say the word hello and nothing else.",
            timeout=30.0,
        )

    assert isinstance(result, str)
    assert result == "hello"


@pytest.mark.asyncio
async def test_ollama_adapter_returns_text():
    adapter = get_llm_adapter({"provider": "ollama"})

    mock_response = AsyncMock()
    mock_response.raise_for_status = lambda: None
    mock_response.json = lambda: {
        "choices": [{"message": {"content": "hello from ollama"}}]
    }

    with patch("httpx.AsyncClient.post", return_value=mock_response):
        result = await adapter.generate(
            system_prompt="You are a helpful assistant.",
            user_message="Say the word hello and nothing else.",
            timeout=30.0,
        )

    assert isinstance(result, str)
    assert result == "hello from ollama"