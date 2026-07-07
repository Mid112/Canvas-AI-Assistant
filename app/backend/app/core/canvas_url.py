from urllib.parse import urlparse

_LOCAL_HTTP_HOSTS = frozenset({"localhost", "127.0.0.1", "canvas_lms"})


def normalize_canvas_url(url: str) -> str:
    return url.strip().rstrip("/")


def canvas_urls_equivalent(a: str, b: str) -> bool:
    left = normalize_canvas_url(a)
    right = normalize_canvas_url(b)
    if left == right:
        return True

    try:
        left_parsed = urlparse(left)
        right_parsed = urlparse(right)
    except ValueError:
        return False

    if left_parsed.scheme != right_parsed.scheme:
        return False

    left_port = left_parsed.port or (443 if left_parsed.scheme == "https" else 80)
    right_port = right_parsed.port or (443 if right_parsed.scheme == "https" else 80)
    if left_port != right_port:
        return False

    left_local = left_parsed.hostname in _LOCAL_HTTP_HOSTS
    right_local = right_parsed.hostname in _LOCAL_HTTP_HOSTS
    if left_local and right_local:
        return True

    return left_parsed.hostname == right_parsed.hostname


def resolve_server_canvas_url(
    canvas_url: str,
    server_default: str | None = None,
) -> str:
    """Host the backend should call — maps browser/docker aliases to CANVAS_API_URL."""
    from app.config import settings

    client_url = normalize_canvas_url(canvas_url)
    server_url = normalize_canvas_url(server_default or settings.CANVAS_API_URL)
    if canvas_urls_equivalent(client_url, server_url):
        return server_url
    return client_url
