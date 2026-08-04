# app/backend/app/services/profanity.py
"""Shared content-safety helpers for student-facing Canvas text.

Intentionally small — not a moderation product.

- ``check_message_profanity``: strict keyword filter for direct instructor→student
  communication (messages, feedback, inbox replies).
- ``check_assignment_content_safety``: same blocklist for assignment titles,
  descriptions, and generate-draft prompts, with a narrow educational
  exemption for *quoted / mentioned* sensitive terms (#1444).

Do **not** reuse the educational exemption for inbox, feedback, or other
direct student messaging — those paths must stay on ``check_message_profanity``.
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

# Academic / instructional framing required alongside a mentioned term.
_EDUCATIONAL_CONTEXT_PATTERN = re.compile(
    r"\b("
    r"analy[sz]e|analysis|discuss(?:ion|ing)?|literature|history|"
    r"media[\s-]?literacy|censor(?:ed|ship)?|quot(?:e|ed|ing|es)|"
    r"archival|academic|essay|compare|contrast|rhetoric|tone|audience|"
    r"workplace communication|professional language|sensitive language|"
    r"slur(?:s)?|profanity"
    r")\b",
    re.IGNORECASE,
)

# Quoted forms ('shit', "fuck") and "the word X" mentions.
_QUOTE_CHARS = "'\"\u2018\u2019\u201c\u201d"
_MENTION_PREFIX_PATTERN = re.compile(
    r"\b(?:word|term|phrase|slur|language)\s+"
    r"(?:['\"\u2018\u2019\u201c\u201d])?$",
    re.IGNORECASE,
)

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


def _blocked_token_is_mentioned(text: str, match: re.Match[str]) -> bool:
    """True when the hit is quoted or introduced as “the word X”."""
    start, end = match.span()
    before = text[start - 1] if start > 0 else ""
    after = text[end] if end < len(text) else ""
    if before in _QUOTE_CHARS and after in _QUOTE_CHARS:
        return True
    prefix = text[max(0, start - 32) : start]
    return bool(_MENTION_PREFIX_PATTERN.search(prefix))


def text_contains_unsafe_assignment_content(*parts: str) -> bool:
    """True when assignment text has abusive blocked language.

    Educational prompts may mention a sensitive term when it is quoted or
    introduced as “the word X” *and* academic framing is present. A blocked
    token used as ordinary abusive wording stays unsafe even if “analyzing”
    appears elsewhere in the string (#1444 review).
    """
    combined = " ".join(part for part in parts if part)
    if not combined:
        return False
    normalized = _collapse_spaced_letters(_normalize_for_profanity(combined))
    matches = list(_PROFANITY_PATTERN.finditer(normalized))
    if not matches:
        return False
    if not _EDUCATIONAL_CONTEXT_PATTERN.search(normalized):
        return True
    # Educational framing alone is not enough — every blocked hit must be a
    # mentioned/quoted term (closes “fucking … analyzing …” bypass).
    return not all(
        _blocked_token_is_mentioned(normalized, match) for match in matches
    )


def check_assignment_content_safety(
    *parts: str, content_label: str = "Assignment content"
) -> None:
    """Raise 422 for abusive assignment text; allow quoted educational mentions."""
    if text_contains_unsafe_assignment_content(*parts):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"{content_label} contains language that is not appropriate for "
                "students. Academic discussion of sensitive language is allowed — "
                "please revise abusive wording and try again."
            ),
        )
