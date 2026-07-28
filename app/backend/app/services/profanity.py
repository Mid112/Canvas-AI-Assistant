# app/backend/app/services/profanity.py
"""Shared student-communication profanity safety net.

Intentionally small — not a moderation product. Used by messaging, feedback,
assignment, and quiz write paths so student-facing Canvas text stays filtered.
"""

from __future__ import annotations

import re
import unicodedata

from fastapi import HTTPException, status

# Plurals / common suffixes are included so dicks, bastards, etc. cannot slip
# past a bare stem + \\b check.
_PROFANITY_BODY = (
    r"fuck(?:ing|ed|ers?|s)?|shit(?:ty|s)?|assholes?|bitch(?:es)?|cunts?|"
    r"dick(?:heads?|s)?|bastards?|sluts?|whores?"
)
_PROFANITY_PATTERN = re.compile(rf"\b({_PROFANITY_BODY})\b", re.IGNORECASE)

# Common Cyrillic / lookalike letters attackers substitute for Latin ones.
_HOMOGLYPHS = str.maketrans(
    {
        "а": "a",
        "е": "e",
        "о": "o",
        "р": "p",
        "с": "c",
        "у": "y",
        "х": "x",
        "і": "i",
        "ї": "i",
        "ё": "e",
        "ѕ": "s",
        "ј": "j",
        "ԁ": "d",
        "ɡ": "g",
    }
)
_ZERO_WIDTH = re.compile(r"[\u200b\u200c\u200d\ufeff\u00ad]")
# Single letters separated only by spaces / punctuation (f u c k, f.u.c.k).
_SPACED_LETTERS = re.compile(
    r"(?<![a-z0-9])([a-z](?:[\s._\-]+[a-z])+)(?![a-z0-9])"
)


def _normalize_for_profanity(text: str) -> str:
    """Fold accents / lookalikes and strip invisible chars before matching."""
    decomposed = unicodedata.normalize("NFKD", text)
    without_marks = "".join(c for c in decomposed if not unicodedata.combining(c))
    folded = without_marks.lower().translate(_HOMOGLYPHS)
    return _ZERO_WIDTH.sub("", folded)


def _collapse_spaced_letters(text: str) -> str:
    """Join obfuscated single-letter runs: 'f u c k' / 'f.u.c.k' → 'fuck'."""
    return _SPACED_LETTERS.sub(lambda m: re.sub(r"[^a-z]", "", m.group(1)), text)


def text_contains_profanity(*parts: str) -> bool:
    combined = " ".join(part for part in parts if part)
    if not combined:
        return False
    normalized = _collapse_spaced_letters(_normalize_for_profanity(combined))
    return bool(_PROFANITY_PATTERN.search(normalized))


def check_message_profanity(*parts: str, content_label: str = "Message") -> None:
    """Raise 422 when any part matches the shared student-communication filter."""
    if text_contains_profanity(*parts):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"{content_label} contains language that is not appropriate for "
                "student communication. Please revise and try again."
            ),
        )
