from urllib.parse import urlparse, urlunparse

_LOCAL_HTTP_HOSTS = frozenset({"localhost", "127.0.0.1", "canvas_lms"})


def normalize_canvas_url(url: str) -> str:
    return url.strip().rstrip("/")


def canonicalize_canvas_institution_url(url: str) -> str:
    """Return the stable storage identity for a Canvas institution.

    URL schemes and DNS hostnames are case-insensitive, but URL parsers may
    preserve their original spelling in ``netloc``. Canonicalizing the
    authority here keeps the database uniqueness key aligned with the URL
    equivalence checks used by the application.
    """
    normalized = normalize_canvas_url(url)
    parsed = urlparse(normalized)

    if parsed.hostname is None:
        return normalized

    hostname = parsed.hostname.lower()
    if hostname in _LOCAL_HTTP_HOSTS:
        hostname = "localhost"

    if ":" in hostname and not hostname.startswith("["):
        hostname = f"[{hostname}]"
    if parsed.port is not None:
        hostname = f"{hostname}:{parsed.port}"

    # Canvas URLs are expected to be ordinary origin URLs without userinfo;
    # preserve it if one is supplied rather than silently changing credentials.
    userinfo = ""
    if parsed.username is not None:
        userinfo = parsed.username
        if parsed.password is not None:
            userinfo += f":{parsed.password}"
        userinfo += "@"

    return urlunparse(
        parsed._replace(
            scheme=parsed.scheme.lower(),
            netloc=f"{userinfo}{hostname}",
        )
    )


def canvas_url_candidates(url: str) -> tuple[str, ...]:
    """Return canonical and legacy URL spellings for one institution."""
    normalized = normalize_canvas_url(url)
    canonical = canonicalize_canvas_institution_url(normalized)
    if canonical == normalized:
        return (canonical,)

    parsed = urlparse(canonical)
    aliases = []
    for host in ("localhost", "127.0.0.1", "canvas_lms"):
        netloc = host if parsed.port is None else f"{host}:{parsed.port}"
        aliases.append(urlunparse(parsed._replace(netloc=netloc)))
    return tuple(dict.fromkeys(aliases))


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
    configured_default = server_default or settings.CANVAS_API_URL
    if not configured_default:
        return client_url

    server_url = normalize_canvas_url(configured_default)
    if canvas_urls_equivalent(client_url, server_url):
        return server_url
    return client_url
