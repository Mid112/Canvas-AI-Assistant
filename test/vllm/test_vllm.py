# Tests for vLLM connection — works whether vLLM is native or dockerized
# Run with: pytest -v from test/vllm with venv active

import pytest
import httpx
import os

VLLM_URL = os.getenv("VLLM_BASE_URL", "http://localhost:8000")
MODEL = os.getenv("VLLM_MODEL", "Qwen/Qwen3-4B")

def test_vllm_health():
    """vLLM server is reachable."""
    response = httpx.get(f"{VLLM_URL}/health")
    assert response.status_code == 200

def test_vllm_model_loaded():
    """Expected model is available."""
    response = httpx.get(f"{VLLM_URL}/v1/models")
    assert response.status_code == 200
    models = response.json()["data"]
    model_ids = [m["id"] for m in models]
    assert MODEL in model_ids

def test_vllm_basic_completion():
    """vLLM returns a valid chat completion."""
    response = httpx.post(
        f"{VLLM_URL}/v1/chat/completions",
        json={
            "model": MODEL,
            "messages": [{"role": "user", "content": "Say the word hello."}],
            "max_tokens": 10
        },
        timeout=60.0
    )
    assert response.status_code == 200
    data = response.json()
    assert "choices" in data
    assert len(data["choices"]) > 0
    assert data["choices"][0]["message"]["content"] is not None