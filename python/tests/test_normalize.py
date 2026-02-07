"""Tests for WhatsApp E.164 / JID normalization utilities.

Mirrors the TypeScript ``normalize.test.ts`` test suite with full coverage
of all normalization, chunking, formatting, and edge-case behaviour.
"""

from __future__ import annotations

import pytest

from elizaos_plugin_whatsapp.normalize import (
    WHATSAPP_TEXT_CHUNK_LIMIT,
    build_whatsapp_user_jid,
    chunk_whatsapp_text,
    format_whatsapp_id,
    format_whatsapp_phone_number,
    get_whatsapp_chat_type,
    is_valid_whatsapp_number,
    is_whatsapp_group,
    is_whatsapp_group_jid,
    is_whatsapp_user_target,
    normalize_e164,
    normalize_whatsapp_target,
    resolve_whatsapp_system_location,
    truncate_text,
)


# ===================================================================
# normalizeE164
# ===================================================================


class TestNormalizeE164:
    """Tests for normalize_e164."""

    def test_empty_input(self) -> None:
        assert normalize_e164("") == ""

    def test_preserve_e164_with_plus(self) -> None:
        assert normalize_e164("+1234567890") == "+1234567890"

    def test_remove_spaces_and_dashes(self) -> None:
        assert normalize_e164("+1 234-567-8901") == "+12345678901"

    def test_remove_parentheses_and_dots(self) -> None:
        assert normalize_e164("+1 (234) 567.8901") == "+12345678901"

    def test_add_plus_prefix_for_long_numbers(self) -> None:
        assert normalize_e164("12345678901") == "+12345678901"

    def test_convert_00_prefix(self) -> None:
        assert normalize_e164("0012345678901") == "+12345678901"

    def test_short_numbers_unmodified(self) -> None:
        assert normalize_e164("123456") == "123456"

    def test_remove_non_digit_except_plus(self) -> None:
        assert normalize_e164("+1-234-ABC-567") == "+1234567"

    def test_whitespace_only(self) -> None:
        assert normalize_e164("   ") == ""

    def test_letters_only(self) -> None:
        assert normalize_e164("abcdef") == ""

    def test_plus_only(self) -> None:
        assert normalize_e164("+") == "+"

    def test_ten_digits_get_plus(self) -> None:
        assert normalize_e164("1234567890") == "+1234567890"

    def test_nine_digits_no_plus(self) -> None:
        assert normalize_e164("123456789") == "123456789"

    def test_double_zero_short(self) -> None:
        assert normalize_e164("001234") == "+1234"


# ===================================================================
# isWhatsAppGroupJid
# ===================================================================


class TestIsWhatsAppGroupJid:
    """Tests for is_whatsapp_group_jid."""

    def test_valid_group_jid(self) -> None:
        assert is_whatsapp_group_jid("123456789-987654321@g.us") is True

    def test_simple_group_jid(self) -> None:
        assert is_whatsapp_group_jid("123456789@g.us") is True

    def test_group_jid_with_whatsapp_prefix(self) -> None:
        assert is_whatsapp_group_jid("whatsapp:123456789-987654321@g.us") is True

    def test_user_jid_not_group(self) -> None:
        assert is_whatsapp_group_jid("41796666864:0@s.whatsapp.net") is False

    def test_phone_number_not_group(self) -> None:
        assert is_whatsapp_group_jid("+1234567890") is False

    def test_invalid_group_alpha(self) -> None:
        assert is_whatsapp_group_jid("invalid@g.us") is False

    def test_invalid_group_mixed(self) -> None:
        assert is_whatsapp_group_jid("123-abc@g.us") is False

    def test_case_insensitive_domain(self) -> None:
        assert is_whatsapp_group_jid("123456789@G.US") is True

    def test_many_segments(self) -> None:
        assert is_whatsapp_group_jid("1-2-3-4-5@g.us") is True

    def test_empty_local(self) -> None:
        assert is_whatsapp_group_jid("@g.us") is False

    def test_double_at(self) -> None:
        assert is_whatsapp_group_jid("12@34@g.us") is False

    def test_trailing_dash(self) -> None:
        assert is_whatsapp_group_jid("123-@g.us") is False

    def test_leading_dash(self) -> None:
        assert is_whatsapp_group_jid("-123@g.us") is False


# ===================================================================
# isWhatsAppUserTarget
# ===================================================================


class TestIsWhatsAppUserTarget:
    """Tests for is_whatsapp_user_target."""

    def test_standard_user_jid(self) -> None:
        assert is_whatsapp_user_target("41796666864:0@s.whatsapp.net") is True

    def test_user_jid_without_device(self) -> None:
        assert is_whatsapp_user_target("41796666864@s.whatsapp.net") is True

    def test_lid(self) -> None:
        assert is_whatsapp_user_target("123456@lid") is True

    def test_with_whatsapp_prefix(self) -> None:
        assert is_whatsapp_user_target("whatsapp:41796666864:0@s.whatsapp.net") is True

    def test_group_jid_not_user(self) -> None:
        assert is_whatsapp_user_target("123456789-987654321@g.us") is False

    def test_plain_phone_not_user(self) -> None:
        assert is_whatsapp_user_target("+1234567890") is False

    def test_lid_case_insensitive(self) -> None:
        assert is_whatsapp_user_target("123456@LID") is True

    def test_user_domain_case_insensitive(self) -> None:
        assert is_whatsapp_user_target("41796666864@S.WHATSAPP.NET") is True


# ===================================================================
# normalizeWhatsAppTarget
# ===================================================================


class TestNormalizeWhatsAppTarget:
    """Tests for normalize_whatsapp_target."""

    def test_empty_string(self) -> None:
        assert normalize_whatsapp_target("") is None

    def test_whitespace_only(self) -> None:
        assert normalize_whatsapp_target("   ") is None

    def test_normalize_group_jid(self) -> None:
        assert normalize_whatsapp_target("123456789-987654321@g.us") == "123456789-987654321@g.us"

    def test_normalize_user_jid_to_e164(self) -> None:
        assert normalize_whatsapp_target("41796666864:0@s.whatsapp.net") == "+41796666864"

    def test_normalize_phone_to_e164(self) -> None:
        assert normalize_whatsapp_target("+1-234-567-8901") == "+12345678901"

    def test_strip_whatsapp_prefix(self) -> None:
        assert normalize_whatsapp_target("whatsapp:+1234567890") == "+1234567890"

    def test_unknown_jid_format(self) -> None:
        assert normalize_whatsapp_target("unknown@domain.com") is None

    def test_invalid_phone_number(self) -> None:
        assert normalize_whatsapp_target("abc") is None

    def test_group_jid_with_prefix(self) -> None:
        assert normalize_whatsapp_target("whatsapp:123-456@g.us") == "123-456@g.us"

    def test_user_jid_without_device(self) -> None:
        assert normalize_whatsapp_target("41796666864@s.whatsapp.net") == "+41796666864"

    def test_single_digit(self) -> None:
        assert normalize_whatsapp_target("5") is None

    def test_multiple_whatsapp_prefixes(self) -> None:
        assert normalize_whatsapp_target("whatsapp:whatsapp:+1234567890") == "+1234567890"

    def test_jid_multiple_device_parts(self) -> None:
        assert normalize_whatsapp_target("41796666864:15@s.whatsapp.net") == "+41796666864"

    def test_lid_short_digits(self) -> None:
        # 9 digits: extracted but not normalized (< 10 digits)
        assert normalize_whatsapp_target("123456789@lid") == "123456789"

    def test_lid_ten_digits(self) -> None:
        # 10+ digits: E.164 normalized
        assert normalize_whatsapp_target("1234567890@lid") == "+1234567890"


# ===================================================================
# formatWhatsAppId
# ===================================================================


class TestFormatWhatsAppId:
    """Tests for format_whatsapp_id."""

    def test_format_group_jid(self) -> None:
        assert format_whatsapp_id("123456789-987654321@g.us") == "group:123456789-987654321@g.us"

    def test_format_user_target_e164(self) -> None:
        assert format_whatsapp_id("41796666864:0@s.whatsapp.net") == "+41796666864"

    def test_format_invalid(self) -> None:
        assert format_whatsapp_id("invalid") == "invalid"

    def test_format_phone_number(self) -> None:
        assert format_whatsapp_id("+1234567890") == "+1234567890"


# ===================================================================
# Chat Type Functions
# ===================================================================


class TestIsWhatsAppGroup:
    """Tests for is_whatsapp_group."""

    def test_group_jid(self) -> None:
        assert is_whatsapp_group("123456789-987654321@g.us") is True

    def test_user_target(self) -> None:
        assert is_whatsapp_group("+1234567890") is False


class TestGetWhatsAppChatType:
    """Tests for get_whatsapp_chat_type."""

    def test_group_jid(self) -> None:
        assert get_whatsapp_chat_type("123456789-987654321@g.us") == "group"

    def test_phone_number(self) -> None:
        assert get_whatsapp_chat_type("+1234567890") == "user"

    def test_user_jid(self) -> None:
        assert get_whatsapp_chat_type("41796666864:0@s.whatsapp.net") == "user"


# ===================================================================
# buildWhatsAppUserJid
# ===================================================================


class TestBuildWhatsAppUserJid:
    """Tests for build_whatsapp_user_jid."""

    def test_from_e164(self) -> None:
        assert build_whatsapp_user_jid("+1234567890") == "1234567890@s.whatsapp.net"

    def test_without_plus(self) -> None:
        assert build_whatsapp_user_jid("1234567890") == "1234567890@s.whatsapp.net"

    def test_strip_non_digits(self) -> None:
        assert build_whatsapp_user_jid("+1-234-567-8901") == "12345678901@s.whatsapp.net"

    def test_short_number(self) -> None:
        assert build_whatsapp_user_jid("12345") == "12345@s.whatsapp.net"


# ===================================================================
# chunkWhatsAppText
# ===================================================================


class TestChunkWhatsAppText:
    """Tests for chunk_whatsapp_text."""

    def test_empty_text(self) -> None:
        assert chunk_whatsapp_text("") == []

    def test_whitespace_only(self) -> None:
        assert chunk_whatsapp_text("   ") == []

    def test_none_text(self) -> None:
        # noinspection PyTypeChecker
        assert chunk_whatsapp_text(None) == []  # type: ignore[arg-type]

    def test_single_chunk_short_text(self) -> None:
        assert chunk_whatsapp_text("Hello world") == ["Hello world"]

    def test_default_chunk_limit(self) -> None:
        assert WHATSAPP_TEXT_CHUNK_LIMIT == 4096

    def test_splits_long_text(self) -> None:
        text = "a" * 5000
        chunks = chunk_whatsapp_text(text, limit=2000)
        assert len(chunks) > 1
        assert all(len(c) <= 2000 for c in chunks)

    def test_prefer_paragraph_breaks(self) -> None:
        text = "Paragraph 1.\n\nParagraph 2."
        chunks = chunk_whatsapp_text(text, limit=20)
        assert "Paragraph 1." in chunks
        assert "Paragraph 2." in chunks

    def test_prefer_sentence_breaks(self) -> None:
        text = "First sentence. Second sentence."
        chunks = chunk_whatsapp_text(text, limit=20)
        assert chunks[0].endswith(".")

    def test_chunks_are_trimmed(self) -> None:
        text = "Word1\n\nWord2"
        chunks = chunk_whatsapp_text(text, limit=10)
        assert all(c == c.strip() for c in chunks)

    def test_no_empty_chunks(self) -> None:
        text = "Hello\n\n\n\nWorld"
        chunks = chunk_whatsapp_text(text, limit=10)
        assert all(len(c) > 0 for c in chunks)

    def test_exactly_at_limit(self) -> None:
        text = "a" * 4096
        chunks = chunk_whatsapp_text(text)
        assert chunks == [text]

    def test_one_over_limit(self) -> None:
        text = "a" * 4097
        chunks = chunk_whatsapp_text(text)
        assert len(chunks) == 2

    def test_word_boundary_split(self) -> None:
        text = "Hello World Foo Bar Baz"
        chunks = chunk_whatsapp_text(text, limit=15)
        # Should split at a word boundary
        for c in chunks:
            assert not c.startswith(" ")
            assert not c.endswith(" ")

    def test_hard_break_no_spaces(self) -> None:
        text = "a" * 100
        chunks = chunk_whatsapp_text(text, limit=30)
        assert all(len(c) <= 30 for c in chunks)

    def test_single_newline_break(self) -> None:
        text = "Line one content.\nLine two content."
        chunks = chunk_whatsapp_text(text, limit=25)
        assert len(chunks) >= 2

    def test_preserves_full_content(self) -> None:
        text = "Hello World! This is a test message."
        chunks = chunk_whatsapp_text(text, limit=20)
        reconstructed = " ".join(chunks)
        # All original words should be present
        for word in text.split():
            assert word.rstrip(".!") in reconstructed or word in reconstructed


# ===================================================================
# truncateText
# ===================================================================


class TestTruncateText:
    """Tests for truncate_text."""

    def test_no_truncation_needed(self) -> None:
        assert truncate_text("Hello", 10) == "Hello"

    def test_truncate_with_ellipsis(self) -> None:
        assert truncate_text("Hello World", 8) == "Hello..."

    def test_text_exactly_at_max(self) -> None:
        assert truncate_text("Hello", 5) == "Hello"

    def test_very_short_max(self) -> None:
        assert truncate_text("Hello", 3) == "..."

    def test_max_length_1(self) -> None:
        assert truncate_text("Hello", 1) == "."

    def test_max_length_2(self) -> None:
        assert truncate_text("Hello", 2) == ".."

    def test_max_length_0(self) -> None:
        assert truncate_text("Hello", 0) == ""

    def test_empty_text(self) -> None:
        assert truncate_text("", 5) == ""


# ===================================================================
# resolveWhatsAppSystemLocation
# ===================================================================


class TestResolveWhatsAppSystemLocation:
    """Tests for resolve_whatsapp_system_location."""

    def test_group_chat_with_name(self) -> None:
        result = resolve_whatsapp_system_location(
            chat_type="group",
            chat_id="123456789-987654321@g.us",
            chat_name="My Group",
        )
        assert result == "WhatsApp group:My Group"

    def test_user_chat_with_name(self) -> None:
        result = resolve_whatsapp_system_location(
            chat_type="user",
            chat_id="+1234567890",
            chat_name="John Doe",
        )
        assert result == "WhatsApp user:John Doe"

    def test_truncated_chat_id_no_name(self) -> None:
        result = resolve_whatsapp_system_location(
            chat_type="user",
            chat_id="12345678901234567890",
        )
        assert result == "WhatsApp user:12345678"

    def test_short_chat_id_no_name(self) -> None:
        result = resolve_whatsapp_system_location(
            chat_type="user",
            chat_id="1234",
        )
        assert result == "WhatsApp user:1234"


# ===================================================================
# isValidWhatsAppNumber
# ===================================================================


class TestIsValidWhatsAppNumber:
    """Tests for is_valid_whatsapp_number."""

    def test_valid_e164(self) -> None:
        assert is_valid_whatsapp_number("+12345678901") is True

    def test_normalizes_to_valid(self) -> None:
        assert is_valid_whatsapp_number("12345678901") is True

    def test_too_short(self) -> None:
        assert is_valid_whatsapp_number("+123456") is False

    def test_too_long(self) -> None:
        assert is_valid_whatsapp_number("+1234567890123456") is False

    def test_group_jid(self) -> None:
        assert is_valid_whatsapp_number("123456789-987654321@g.us") is False

    def test_empty_string(self) -> None:
        assert is_valid_whatsapp_number("") is False

    def test_ten_digits_valid(self) -> None:
        assert is_valid_whatsapp_number("+1234567890") is True

    def test_fifteen_digits_valid(self) -> None:
        assert is_valid_whatsapp_number("+123456789012345") is True

    def test_user_jid_with_valid_phone(self) -> None:
        # User JID extracts the phone, which may be valid
        assert is_valid_whatsapp_number("12345678901@s.whatsapp.net") is True


# ===================================================================
# formatWhatsAppPhoneNumber
# ===================================================================


class TestFormatWhatsAppPhoneNumber:
    """Tests for format_whatsapp_phone_number."""

    def test_long_number_has_spaces(self) -> None:
        result = format_whatsapp_phone_number("+12345678901")
        assert " " in result

    def test_short_number_preserved(self) -> None:
        assert format_whatsapp_phone_number("+1234567890") == "+1234567890"

    def test_invalid_returns_original(self) -> None:
        assert format_whatsapp_phone_number("abc") == "abc"

    def test_formatted_number(self) -> None:
        result = format_whatsapp_phone_number("+1-234-567-8901")
        assert result.startswith("+")

    def test_specific_format(self) -> None:
        result = format_whatsapp_phone_number("+12345678901")
        assert result == "+1 234 567 8901"

    def test_two_digit_country_code(self) -> None:
        result = format_whatsapp_phone_number("+441234567890")
        assert result == "+44 123 456 7890"


# ===================================================================
# Edge Cases
# ===================================================================


class TestEdgeCases:
    """Edge case tests matching the TypeScript test suite."""

    def test_jid_multiple_device_parts(self) -> None:
        assert normalize_whatsapp_target("41796666864:15@s.whatsapp.net") == "+41796666864"

    def test_multiple_whatsapp_prefixes(self) -> None:
        assert normalize_whatsapp_target("whatsapp:whatsapp:+1234567890") == "+1234567890"

    def test_group_jid_many_segments(self) -> None:
        assert is_whatsapp_group_jid("1-2-3-4-5@g.us") is True

    def test_group_jid_invalid_chars(self) -> None:
        assert is_whatsapp_group_jid("123-abc-456@g.us") is False

    def test_lid_normalization_short(self) -> None:
        assert normalize_whatsapp_target("123456789@lid") == "123456789"

    def test_lid_normalization_long(self) -> None:
        assert normalize_whatsapp_target("1234567890@lid") == "+1234567890"

    def test_double_prefix_group(self) -> None:
        assert is_whatsapp_group_jid("whatsapp:whatsapp:123-456@g.us") is True

    def test_mixed_case_whatsapp_prefix(self) -> None:
        assert normalize_whatsapp_target("WhatsApp:+1234567890") == "+1234567890"

    def test_upper_case_domain_user_jid(self) -> None:
        assert normalize_whatsapp_target("41796666864@S.WHATSAPP.NET") == "+41796666864"

    def test_group_jid_uppercase_domain(self) -> None:
        # Domain is normalized to lowercase @g.us
        assert normalize_whatsapp_target("123-456@G.US") == "123-456@g.us"

    def test_at_sign_in_middle_invalid(self) -> None:
        assert normalize_whatsapp_target("some@random@thing") is None

    def test_only_at_sign(self) -> None:
        assert normalize_whatsapp_target("@") is None

    def test_empty_after_prefix_strip(self) -> None:
        assert normalize_whatsapp_target("whatsapp:") is None

    def test_consecutive_dashes_in_group_jid(self) -> None:
        # "123--456@g.us" → local part has empty segment between dashes
        assert is_whatsapp_group_jid("123--456@g.us") is False
