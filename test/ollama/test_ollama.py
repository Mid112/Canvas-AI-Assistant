# Integration tests for Ollama — requires a running Ollama server.
# Run with: make install-ollama && make run-ollama && make test-ollama

import os

import httpx

OLLAMA_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434/v1")
MODEL = os.getenv("OLLAMA_MODEL", "llama3.2")


# Verifies: Ollama server reachable.
def test_ollama_server_reachable():
    """Ollama server is reachable."""
    response = httpx.get(OLLAMA_URL.replace("/v1", "/"), timeout=10.0)
    assert response.status_code == 200


# Verifies: Ollama model available.
def test_ollama_model_available():
    """Expected model is available."""
    response = httpx.get(f"{OLLAMA_URL}/models", timeout=10.0)
    assert response.status_code == 200
    models = response.json().get("data", [])
    model_ids = [model["id"] for model in models]
    assert MODEL in model_ids


# Verifies: Ollama basic completion.
def test_ollama_basic_completion():
    """Ollama returns a valid chat completion."""
    response = httpx.post(
        f"{OLLAMA_URL}/chat/completions",
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
