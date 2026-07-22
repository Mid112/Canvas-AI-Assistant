"""Validate instructor-supplied OpenAI-compatible base URLs.

Only normal DNS hostnames and standard dotted-quad / IPv6 literals are
accepted. Alternate IP encodings (decimal, octal, hex) are rejected so they
cannot bypass private/loopback checks by being treated as hostnames.

DNS rebinding is not fully prevented here — callers should still treat custom
endpoints as instructor-owned destinations.
"""

from __future__ import annotations

import ipaddress
import re
from urllib.parse import urlparse

from fastapi import HTTPException, status

# Standard dotted-quad only: no leading zeros, each octet 0-255.
_IPV4_DOTTED_QUAD = re.compile(
    r"^(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)"
    r"(?:\.(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)){3}$"
)
_DNS_LABEL = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$", re.IGNORECASE)


def _reject(detail: str) -> None:
    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        detail=detail,
    )


def _parse_literal_ip(host: str) -> ipaddress.IPv4Address | ipaddress.IPv6Address | None:
    """Return an IP only for standard dotted-quad or IPv6 literal hosts."""
    if _IPV4_DOTTED_QUAD.fullmatch(host):
        return ipaddress.IPv4Address(host)
    if ":" in host:
        try:
            return ipaddress.IPv6Address(host)
        except ValueError:
            _reject("Custom provider base URL host is not a valid IPv6 address.")
    return None


def _is_dns_hostname(host: str) -> bool:
    """Allow normal DNS names; reject all-numeric / hex-style IP encodings."""
    candidate = host[:-1] if host.endswith(".") else host
    if not candidate or candidate.startswith(".") or ".." in candidate:
        return False
    # Decimal (2130706433), hex (0x7f000001), and similar must not pass as DNS.
    if candidate.isdigit() or candidate.lower().startswith("0x"):
        return False
    if any(ch in candidate for ch in " _/\\"):
        return False
    labels = candidate.split(".")
    if not labels or any(not _DNS_LABEL.fullmatch(label) for label in labels):
        return False
    # Require at least one letter so numeric-only labels cannot encode IPs.
    return any(ch.isalpha() for ch in candidate)


def validate_llm_base_url(raw_url: str) -> str:
    normalized = (raw_url or "").strip().rstrip("/")
    if not normalized:
        _reject("A base URL is required for custom providers.")

    parsed = urlparse(normalized)
    if parsed.scheme not in {"http", "https"}:
        _reject("Custom provider base URL must use http or https.")
    if parsed.username or parsed.password:
        _reject("Custom provider base URL must not include credentials.")
    host = (parsed.hostname or "").strip().lower()
    if not host:
        _reject("Custom provider base URL is missing a host.")
    if host in {"localhost", "metadata.google.internal"} or host.endswith(".localhost"):
        _reject("Custom provider base URL cannot target loopback or metadata hosts.")

    ip = _parse_literal_ip(host)
    if ip is not None:
        if (
            ip.is_loopback
            or ip.is_link_local
            or ip.is_private
            or ip.is_reserved
            or ip.is_multicast
            or ip.is_unspecified
        ):
            _reject(
                "Custom provider base URL cannot target private or reserved addresses."
            )
        return normalized

    if not _is_dns_hostname(host):
        _reject(
            "Custom provider base URL host must be a DNS name or a standard "
            "IPv4 dotted-quad / IPv6 literal."
        )

    return normalized
