"""Test note: covers the test canvas url behavior so future changes can preserve the expected Canvas workflow contract."""

from app.core.canvas_url import canvas_urls_equivalent, normalize_canvas_url, resolve_server_canvas_url


# Verifies: Normalize canvas url strips trailing slash.
def test_normalize_canvas_url_strips_trailing_slash():
    assert normalize_canvas_url("http://localhost:3000/") == "http://localhost:3000"


# Verifies: Canvas urls equivalent local aliases.
def test_canvas_urls_equivalent_local_aliases():
    assert canvas_urls_equivalent("http://localhost:3000", "http://canvas_lms:3000")
    assert canvas_urls_equivalent("http://127.0.0.1:3000", "http://localhost:3000")


# Verifies: Canvas urls equivalent different hosts.
def test_canvas_urls_equivalent_different_hosts():
    assert not canvas_urls_equivalent("https://canvas.example.edu", "https://canvas.sfu.ca")


# Verifies: Resolve server canvas url maps local aliases.
def test_resolve_server_canvas_url_maps_local_aliases(monkeypatch):
    monkeypatch.setattr(
        "app.config.settings.CANVAS_API_URL",
        "http://canvas_lms:3000",
        raising=False,
    )
    from app.config import settings

    assert (
        resolve_server_canvas_url("http://localhost:3000", settings.CANVAS_API_URL)
        == "http://canvas_lms:3000"
    )


# Verifies: Resolve server canvas url keeps client url when no global default is configured.
def test_resolve_server_canvas_url_without_default_keeps_client_url(monkeypatch):
    monkeypatch.setattr(
        "app.config.settings.CANVAS_API_URL",
        None,
        raising=False,
    )

    assert (
        resolve_server_canvas_url("https://canvas.example.edu")
        == "https://canvas.example.edu"
    )
