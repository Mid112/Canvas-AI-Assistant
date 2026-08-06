"""Core note: centralizes limiter infrastructure used across the backend."""

from slowapi import Limiter
from slowapi.util import get_remote_address

# Keyed by client IP; swap storage_uri to "redis://..." for multi-worker deployments
limiter = Limiter(key_func=get_remote_address)
