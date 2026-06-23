# test/backend/test_llm.py
import pytest
from app.services.llm.llm_setting import get_llm_adapter

@pytest.mark.asyncio
async def test_vllm_adapter_returns_text():
    adapter = get_llm_adapter({"provider": "vllm"})
    result = await adapter.generate(
    system_prompt="You are a helpful assistant.",
    user_message="Say the word hello and nothing else.",
    timeout=90.0,
)
    assert isinstance(result, str)
    assert len(result) > 0


# when manually timed on M1 Macbook Pro with 16GB RAM, the vLLM adapter takes about 26 seconds to return a response for a simple prompt of hello.