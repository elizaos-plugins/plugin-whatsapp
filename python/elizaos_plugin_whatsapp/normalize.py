"""WhatsApp E.164 and JID normalization utilities.

Provides phone number normalization to E.164 format, WhatsApp JID parsing
(user JIDs, group JIDs, LIDs), text chunking for message limits, and
display formatting helpers.
"""

from __future__ import annotations

import re
from typing import Literal

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

WHATSAPP_TEXT_CHUNK_LIMIT: int = 4096
"""Default character limit for a single WhatsApp text message."""

# ---------------------------------------------------------------------------
# Internal regexes
# ---------------------------------------------------------------------------

_WHATSAPP_USER_JID_RE = re.compile(r"^(\d+)(?::\d+)?@s\.whatsapp\.net$", re.IGNORECASE)
"""Matches user JIDs like ``41796666864:0@s.whatsapp.net``."""

_WHATSAPP_LID_RE = re.compile(r"^(\d+)@lid$", re.IGNORECASE)
"""Matches LID JIDs like ``123@lid``."""

_WHATSAPP_PREFIX_RE = re.compile(r"^whatsapp:", re.IGNORECASE)
"""Matches the ``whatsapp:`` URI prefix (case-insensitive)."""

_GROUP_LOCAL_RE = re.compile(r"^[0-9]+(-[0-9]+)*$")
"""Valid local part of a group JID (digits separated by dashes)."""


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _strip_whatsapp_target_prefixes(value: str) -> str:
    """Strip all leading ``whatsapp:`` prefixes from *value*."""
    candidate = value.strip()
    while True:
        before = candidate
        candidate = _WHATSAPP_PREFIX_RE.sub("", candidate).strip()
        if candidate == before:
            return candidate


# ---------------------------------------------------------------------------
# E.164 normalization
# ---------------------------------------------------------------------------


def normalize_e164(input_: str) -> str:
    """Normalize a phone number string to E.164 format.

    * Strips whitespace, dashes, parentheses, and dots.
    * Keeps ``+`` prefix if present.
    * Converts leading ``00`` to ``+``.
    * Prepends ``+`` for numbers >= 10 digits without a prefix.
    * Returns a short digit string as-is if < 10 digits.
    * Returns ``""`` if the input contains no usable digits.
    """
    stripped = re.sub(r"[\s\-(). ]+", "", input_)
    digits_only = re.sub(r"[^\d+]", "", stripped)

    if not digits_only:
        return ""

    # Already E.164
    if digits_only.startswith("+"):
        return digits_only

    # International prefix ``00``
    if digits_only.startswith("00"):
        return f"+{digits_only[2:]}"

    # Full number without ``+``
    if len(digits_only) >= 10:
        return f"+{digits_only}"

    # Too short – return as-is
    return digits_only


# ---------------------------------------------------------------------------
# JID classification
# ---------------------------------------------------------------------------


def is_whatsapp_group_jid(value: str) -> bool:
    """Return ``True`` if *value* is a WhatsApp group JID (``…@g.us``).

    Handles optional ``whatsapp:`` prefix and is case-insensitive for the
    domain part.  The local part must be digit groups separated by dashes.
    """
    candidate = _strip_whatsapp_target_prefixes(value)
    lower = candidate.lower()
    if not lower.endswith("@g.us"):
        return False
    local_part = candidate[: len(candidate) - len("@g.us")]
    if not local_part or "@" in local_part:
        return False
    return bool(_GROUP_LOCAL_RE.match(local_part))


def is_whatsapp_user_target(value: str) -> bool:
    """Return ``True`` if *value* looks like a WhatsApp user target.

    Matches user JIDs (``…@s.whatsapp.net``) and LIDs (``…@lid``).
    """
    candidate = _strip_whatsapp_target_prefixes(value)
    return bool(_WHATSAPP_USER_JID_RE.match(candidate) or _WHATSAPP_LID_RE.match(candidate))


# ---------------------------------------------------------------------------
# Phone extraction from JIDs
# ---------------------------------------------------------------------------


def _extract_user_jid_phone(jid: str) -> str | None:
    """Extract the phone-number portion from a user JID or LID.

    ``"41796666864:0@s.whatsapp.net"`` → ``"41796666864"``
    ``"123456@lid"`` → ``"123456"``
    """
    if m := _WHATSAPP_USER_JID_RE.match(jid):
        return m.group(1)
    if m := _WHATSAPP_LID_RE.match(jid):
        return m.group(1)
    return None


# ---------------------------------------------------------------------------
# Target normalization
# ---------------------------------------------------------------------------


def normalize_whatsapp_target(value: str) -> str | None:
    """Normalize a WhatsApp target (phone number, user JID, or group JID).

    Returns ``None`` when the target cannot be recognized.
    """
    candidate = _strip_whatsapp_target_prefixes(value)
    if not candidate:
        return None

    # Group JIDs
    if is_whatsapp_group_jid(candidate):
        local_part = candidate[: len(candidate) - len("@g.us")]
        return f"{local_part}@g.us"

    # User JIDs / LIDs
    if is_whatsapp_user_target(candidate):
        phone = _extract_user_jid_phone(candidate)
        if phone is None:
            return None
        normalized = normalize_e164(phone)
        return normalized if len(normalized) > 1 else None

    # Unknown JID-ish string → fail fast
    if "@" in candidate:
        return None

    # Plain phone number
    normalized = normalize_e164(candidate)
    return normalized if len(normalized) > 1 else None


# ---------------------------------------------------------------------------
# Formatting helpers
# ---------------------------------------------------------------------------


def format_whatsapp_id(id_: str) -> str:
    """Format a WhatsApp ID for display.

    Groups get a ``group:`` prefix; user targets become E.164.
    """
    if is_whatsapp_group_jid(id_):
        return f"group:{id_}"
    normalized = normalize_whatsapp_target(id_)
    return normalized if normalized else id_


def is_whatsapp_group(id_: str) -> bool:
    """Return ``True`` if *id_* is a WhatsApp group JID."""
    return is_whatsapp_group_jid(id_)


def get_whatsapp_chat_type(id_: str) -> Literal["group", "user"]:
    """Return ``"group"`` or ``"user"`` depending on the JID type."""
    return "group" if is_whatsapp_group_jid(id_) else "user"


def build_whatsapp_user_jid(phone_number: str) -> str:
    """Build a WhatsApp user JID from a phone number.

    ``"+1234567890"`` → ``"1234567890@s.whatsapp.net"``
    """
    normalized = normalize_e164(phone_number)
    digits = normalized.lstrip("+")
    return f"{digits}@s.whatsapp.net"


# ---------------------------------------------------------------------------
# Text chunking
# ---------------------------------------------------------------------------


def _split_at_break_point(text: str, limit: int) -> tuple[str, str]:
    """Split *text* at the last safe break point within *limit*.

    Returns ``(chunk, remainder)``.  Prefers paragraph breaks, then line
    breaks, then sentence boundaries, then word boundaries.  Falls back to
    a hard cut at *limit*.
    """
    if len(text) <= limit:
        return text, ""

    search_area = text[:limit]
    half = int(limit * 0.5)

    # Prefer double newlines (paragraph breaks)
    idx = search_area.rfind("\n\n")
    if idx > half:
        return text[:idx].rstrip(), text[idx + 2 :].lstrip()

    # Single newlines
    idx = search_area.rfind("\n")
    if idx > half:
        return text[:idx].rstrip(), text[idx + 1 :].lstrip()

    # Sentence boundaries
    sentence_end = max(
        search_area.rfind(". "),
        search_area.rfind("! "),
        search_area.rfind("? "),
    )
    if sentence_end > half:
        return text[: sentence_end + 1].rstrip(), text[sentence_end + 2 :].lstrip()

    # Word boundaries
    idx = search_area.rfind(" ")
    if idx > half:
        return text[:idx].rstrip(), text[idx + 1 :].lstrip()

    # Hard break
    return text[:limit], text[limit:]


def chunk_whatsapp_text(
    text: str,
    *,
    limit: int | None = None,
) -> list[str]:
    """Chunk *text* for WhatsApp messages.

    Splits intelligently at paragraph, line, sentence, and word boundaries.
    Returns an empty list for falsy / whitespace-only input.
    """
    effective_limit = limit if limit is not None else WHATSAPP_TEXT_CHUNK_LIMIT

    if not text or not text.strip():
        return []

    normalized_text = text.strip()
    if len(normalized_text) <= effective_limit:
        return [normalized_text]

    chunks: list[str] = []
    remaining = normalized_text

    while remaining:
        chunk, remaining = _split_at_break_point(remaining, effective_limit)
        if chunk:
            chunks.append(chunk)

    return [c for c in chunks if c]


# ---------------------------------------------------------------------------
# Truncation
# ---------------------------------------------------------------------------


def truncate_text(text: str, max_length: int) -> str:
    """Truncate *text* to *max_length* characters, appending ``...`` if cut."""
    if len(text) <= max_length:
        return text
    if max_length <= 3:
        return "..."[:max_length]
    return f"{text[: max_length - 3]}..."


# ---------------------------------------------------------------------------
# System location
# ---------------------------------------------------------------------------


def resolve_whatsapp_system_location(
    *,
    chat_type: Literal["group", "user"],
    chat_id: str,
    chat_name: str | None = None,
) -> str:
    """Build a human-readable system location string for logging."""
    name = chat_name or chat_id[:8]
    return f"WhatsApp {chat_type}:{name}"


# ---------------------------------------------------------------------------
# Phone validation / formatting
# ---------------------------------------------------------------------------


def is_valid_whatsapp_number(value: str) -> bool:
    """Return ``True`` if *value* normalizes to a valid WhatsApp phone number.

    Must be E.164 format with 10-15 digits (after the ``+``).
    """
    if not (normalized := normalize_whatsapp_target(value)):
        return False
    if not normalized.startswith("+"):
        return False
    digits = normalized.lstrip("+")
    return bool(re.fullmatch(r"\d{10,15}", digits))


def format_whatsapp_phone_number(phone_number: str) -> str:
    """Format a phone number for WhatsApp display.

    Numbers longer than 10 digits are split into country-code + local
    portions separated by spaces.
    """
    normalized = normalize_e164(phone_number)
    if not normalized:
        return phone_number
    digits = normalized.lstrip("+")
    if len(digits) <= 10:
        return normalized
    country_code = digits[: len(digits) - 10]
    rest = digits[-10:]
    return f"+{country_code} {rest[:3]} {rest[3:6]} {rest[6:]}"
