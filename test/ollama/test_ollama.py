# Tests for Ollama connection — requires a running Ollama server
# Run with: pytest -v test/ollama with venv active

import httpx
import os

OLLAMA_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
MODEL = os.getenv("OLLAMA_MODEL", "llama3.2")


def test_ollama_server_reachable():
    """Ollama server is reachable."""
    response = httpx.get(f"{OLLAMA_URL}/api/tags", timeout=10.0)
    assert response.status_code == 200


def test_ollama_model_available():
    """Expected model is available."""
    response = httpx.get(f"{OLLAMA_URL}/api/tags", timeout=10.0)
    assert response.status_code == 200
    models = response.json().get("models", [])
    model_names = [m["name"].split(":")[0] for m in models]
    assert MODEL in model_names


def test_ollama_basic_completion():
    """Ollama returns a valid OpenAI-compatible chat completion."""
    response = httpx.post(
        f"{OLLAMA_URL}/v1/chat/completions",
        json={
            "model": MODEL,
            "messages": [{"role": "user", "content": "Say the word hello."}],
            "max_tokens": 10,
        },
        timeout=60.0,
    )
    assert response.status_code == 200
    data = response.json()
    assert "choices" in data
    assert len(data["choices"]) > 0
    assert data["choices"][0]["message"]["content"] is not None
