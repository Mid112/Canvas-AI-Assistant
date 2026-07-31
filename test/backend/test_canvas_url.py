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
    assert not canvas_urls_equivalent("https://canvas.ubc.ca", "https://canvas.sfu.ca")


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


def test_resolve_canvas_url_for_user_prefers_saved_connection_when_omitted():
    from types import SimpleNamespace

    from app.core.canvas_url import resolve_canvas_url_for_user

    user = SimpleNamespace(
        canvas_connections=[
            SimpleNamespace(canvas_url="http://localhost:3000"),
        ]
    )

    assert (
        resolve_canvas_url_for_user(user, None, server_default="https://canvas.ubc.ca")
        == "http://localhost:3000"
    )


def test_resolve_canvas_url_for_user_keeps_matching_explicit_url():
    from types import SimpleNamespace

    from app.core.canvas_url import resolve_canvas_url_for_user

    user = SimpleNamespace(
        canvas_connections=[
            SimpleNamespace(canvas_url="http://localhost:3000/"),
            SimpleNamespace(canvas_url="https://canvas.ubc.ca"),
        ]
    )

    assert (
        resolve_canvas_url_for_user(user, "http://localhost:3000")
        == "http://localhost:3000"
    )


def test_resolve_canvas_url_for_user_falls_back_to_global_without_connections():
    from types import SimpleNamespace

    from app.core.canvas_url import resolve_canvas_url_for_user

    user = SimpleNamespace(canvas_connections=[])

    assert (
        resolve_canvas_url_for_user(user, None, server_default="https://canvas.ubc.ca")
        == "https://canvas.ubc.ca"
    )
