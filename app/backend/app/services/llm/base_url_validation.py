"""Validate instructor-supplied OpenAI-compatible base URLs.

Blocks obvious SSRF targets (loopback, link-local, and private IP literals).
DNS rebinding is not fully prevented here — callers should still treat custom
endpoints as instructor-owned destinations.
"""

from __future__ import annotations

import ipaddress
from urllib.parse import urlparse

from fastapi import HTTPException, status


def validate_llm_base_url(raw_url: str) -> str:
    normalized = (raw_url or "").strip().rstrip("/")
    if not normalized:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="A base URL is required for custom providers.",
        )

    parsed = urlparse(normalized)
    if parsed.scheme not in {"http", "https"}:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Custom provider base URL must use http or https.",
        )
    if parsed.username or parsed.password:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Custom provider base URL must not include credentials.",
        )
    host = (parsed.hostname or "").strip().lower()
    if not host:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Custom provider base URL is missing a host.",
        )
    if host in {"localhost", "metadata.google.internal"} or host.endswith(".localhost"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Custom provider base URL cannot target loopback or metadata hosts.",
        )

    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        ip = None

    if ip is not None and (
        ip.is_loopback
        or ip.is_link_local
        or ip.is_private
        or ip.is_reserved
        or ip.is_multicast
        or ip.is_unspecified
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Custom provider base URL cannot target private or reserved addresses.",
        )

    return normalized
