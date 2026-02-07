//! WhatsApp E.164 and JID normalization utilities.
//!
//! Provides phone number normalization to E.164 format, WhatsApp JID parsing
//! (user JIDs, group JIDs, LIDs), text chunking for message limits, and
//! display formatting helpers.

use regex::Regex;
use std::sync::LazyLock;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Default character limit for a single WhatsApp text message.
pub const WHATSAPP_TEXT_CHUNK_LIMIT: usize = 4096;

// ---------------------------------------------------------------------------
// Compiled regexes (thread-safe, compiled once)
// ---------------------------------------------------------------------------

static WHATSAPP_USER_JID_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)^(\d+)(?::\d+)?@s\.whatsapp\.net$").unwrap());

static WHATSAPP_LID_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)^(\d+)@lid$").unwrap());

static WHATSAPP_PREFIX_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)^whatsapp:").unwrap());

static GROUP_LOCAL_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^[0-9]+(-[0-9]+)*$").unwrap());

static STRIP_FORMATTING_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"[\s\-().]+").unwrap());

static NON_DIGIT_PLUS_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"[^\d+]").unwrap());

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/// Strip all leading `whatsapp:` prefixes from a value.
fn strip_whatsapp_target_prefixes(value: &str) -> String {
    let mut candidate = value.trim().to_string();
    loop {
        let next = WHATSAPP_PREFIX_RE.replace(&candidate, "").trim().to_string();
        if next == candidate {
            return candidate;
        }
        candidate = next;
    }
}

// ---------------------------------------------------------------------------
// E.164 normalization
// ---------------------------------------------------------------------------

/// Normalize a phone number string to E.164 format.
///
/// - Strips whitespace, dashes, parentheses, and dots.
/// - Keeps `+` prefix if present.
/// - Converts leading `00` to `+`.
/// - Prepends `+` for numbers >= 10 digits without a prefix.
/// - Returns a short digit string as-is if < 10 digits.
/// - Returns `""` if the input contains no usable digits.
pub fn normalize_e164(input: &str) -> String {
    let stripped = STRIP_FORMATTING_RE.replace_all(input, "");
    let digits_only = NON_DIGIT_PLUS_RE.replace_all(&stripped, "").to_string();

    if digits_only.is_empty() {
        return String::new();
    }

    // Already E.164
    if digits_only.starts_with('+') {
        return digits_only;
    }

    // International prefix `00`
    if digits_only.starts_with("00") {
        return format!("+{}", &digits_only[2..]);
    }

    // Full number without `+`
    if digits_only.len() >= 10 {
        return format!("+{}", digits_only);
    }

    // Too short
    digits_only
}

// ---------------------------------------------------------------------------
// JID classification
// ---------------------------------------------------------------------------

/// Return `true` if `value` is a WhatsApp group JID (e.g., `…@g.us`).
///
/// Handles optional `whatsapp:` prefix and is case-insensitive for the
/// domain part. The local part must be digit groups separated by dashes.
pub fn is_whatsapp_group_jid(value: &str) -> bool {
    let candidate = strip_whatsapp_target_prefixes(value);
    let lower = candidate.to_lowercase();
    if !lower.ends_with("@g.us") {
        return false;
    }
    let local_len = candidate.len() - "@g.us".len();
    let local_part = &candidate[..local_len];
    if local_part.is_empty() || local_part.contains('@') {
        return false;
    }
    GROUP_LOCAL_RE.is_match(local_part)
}

/// Return `true` if `value` looks like a WhatsApp user target.
///
/// Matches user JIDs (`…@s.whatsapp.net`) and LIDs (`…@lid`).
pub fn is_whatsapp_user_target(value: &str) -> bool {
    let candidate = strip_whatsapp_target_prefixes(value);
    WHATSAPP_USER_JID_RE.is_match(&candidate) || WHATSAPP_LID_RE.is_match(&candidate)
}

// ---------------------------------------------------------------------------
// Phone extraction from JIDs
// ---------------------------------------------------------------------------

/// Extract the phone-number portion from a user JID or LID.
///
/// `"41796666864:0@s.whatsapp.net"` → `Some("41796666864")`
/// `"123456@lid"` → `Some("123456")`
fn extract_user_jid_phone(jid: &str) -> Option<String> {
    if let Some(caps) = WHATSAPP_USER_JID_RE.captures(jid) {
        return Some(caps[1].to_string());
    }
    if let Some(caps) = WHATSAPP_LID_RE.captures(jid) {
        return Some(caps[1].to_string());
    }
    None
}

// ---------------------------------------------------------------------------
// Target normalization
// ---------------------------------------------------------------------------

/// Normalize a WhatsApp target (phone number, user JID, or group JID).
///
/// Returns `None` when the target cannot be recognized.
pub fn normalize_whatsapp_target(value: &str) -> Option<String> {
    let candidate = strip_whatsapp_target_prefixes(value);
    if candidate.is_empty() {
        return None;
    }

    // Group JIDs
    if is_whatsapp_group_jid(&candidate) {
        let local_len = candidate.len() - "@g.us".len();
        let local_part = &candidate[..local_len];
        return Some(format!("{}@g.us", local_part));
    }

    // User JIDs / LIDs
    if is_whatsapp_user_target(&candidate) {
        let phone = extract_user_jid_phone(&candidate)?;
        let normalized = normalize_e164(&phone);
        return if normalized.len() > 1 {
            Some(normalized)
        } else {
            None
        };
    }

    // Unknown JID-ish string
    if candidate.contains('@') {
        return None;
    }

    // Plain phone number
    let normalized = normalize_e164(&candidate);
    if normalized.len() > 1 {
        Some(normalized)
    } else {
        None
    }
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/// Format a WhatsApp ID for display.
///
/// Groups get a `group:` prefix; user targets become E.164.
pub fn format_whatsapp_id(id: &str) -> String {
    if is_whatsapp_group_jid(id) {
        return format!("group:{}", id);
    }
    normalize_whatsapp_target(id).unwrap_or_else(|| id.to_string())
}

/// Return `true` if `id` is a WhatsApp group JID.
pub fn is_whatsapp_group(id: &str) -> bool {
    is_whatsapp_group_jid(id)
}

/// Chat type: either `"group"` or `"user"`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WhatsAppChatKind {
    Group,
    User,
}

impl WhatsAppChatKind {
    /// Return the string representation.
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Group => "group",
            Self::User => "user",
        }
    }
}

impl std::fmt::Display for WhatsAppChatKind {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

/// Get the chat type from a WhatsApp ID.
pub fn get_whatsapp_chat_type(id: &str) -> WhatsAppChatKind {
    if is_whatsapp_group_jid(id) {
        WhatsAppChatKind::Group
    } else {
        WhatsAppChatKind::User
    }
}

/// Build a WhatsApp user JID from a phone number.
///
/// `"+1234567890"` → `"1234567890@s.whatsapp.net"`
pub fn build_whatsapp_user_jid(phone_number: &str) -> String {
    let normalized = normalize_e164(phone_number);
    let digits = normalized.trim_start_matches('+');
    format!("{}@s.whatsapp.net", digits)
}

// ---------------------------------------------------------------------------
// Text chunking
// ---------------------------------------------------------------------------

/// Split text at the last safe break point within `limit`.
///
/// Returns `(chunk, remainder)`.
fn split_at_break_point(text: &str, limit: usize) -> (String, String) {
    if text.len() <= limit {
        return (text.to_string(), String::new());
    }

    let search_area = &text[..limit];
    let half = limit / 2;

    // Prefer double newlines (paragraph breaks)
    if let Some(idx) = search_area.rfind("\n\n") {
        if idx > half {
            return (
                text[..idx].trim_end().to_string(),
                text[idx + 2..].trim_start().to_string(),
            );
        }
    }

    // Single newlines
    if let Some(idx) = search_area.rfind('\n') {
        if idx > half {
            return (
                text[..idx].trim_end().to_string(),
                text[idx + 1..].trim_start().to_string(),
            );
        }
    }

    // Sentence boundaries
    let sentence_end = [
        search_area.rfind(". "),
        search_area.rfind("! "),
        search_area.rfind("? "),
    ]
    .into_iter()
    .flatten()
    .max();

    if let Some(idx) = sentence_end {
        if idx > half {
            return (
                text[..=idx].trim_end().to_string(),
                text[idx + 2..].trim_start().to_string(),
            );
        }
    }

    // Word boundaries
    if let Some(idx) = search_area.rfind(' ') {
        if idx > half {
            return (
                text[..idx].trim_end().to_string(),
                text[idx + 1..].trim_start().to_string(),
            );
        }
    }

    // Hard break
    (text[..limit].to_string(), text[limit..].to_string())
}

/// Chunk text for WhatsApp messages.
///
/// Splits intelligently at paragraph, line, sentence, and word boundaries.
/// Returns an empty vec for empty / whitespace-only input.
pub fn chunk_whatsapp_text(text: &str, limit: Option<usize>) -> Vec<String> {
    let effective_limit = limit.unwrap_or(WHATSAPP_TEXT_CHUNK_LIMIT);

    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Vec::new();
    }

    if trimmed.len() <= effective_limit {
        return vec![trimmed.to_string()];
    }

    let mut chunks = Vec::new();
    let mut remaining = trimmed.to_string();

    while !remaining.is_empty() {
        let (chunk, rest) = split_at_break_point(&remaining, effective_limit);
        if !chunk.is_empty() {
            chunks.push(chunk);
        }
        remaining = rest;
    }

    chunks.retain(|c| !c.is_empty());
    chunks
}

// ---------------------------------------------------------------------------
// Truncation
// ---------------------------------------------------------------------------

/// Truncate text to `max_length` characters, appending `...` if cut.
pub fn truncate_text(text: &str, max_length: usize) -> String {
    if text.len() <= max_length {
        return text.to_string();
    }
    if max_length <= 3 {
        return "..."[..max_length].to_string();
    }
    format!("{}...", &text[..max_length - 3])
}

// ---------------------------------------------------------------------------
// System location
// ---------------------------------------------------------------------------

/// Build a human-readable system location string for logging.
pub fn resolve_whatsapp_system_location(
    chat_type: WhatsAppChatKind,
    chat_id: &str,
    chat_name: Option<&str>,
) -> String {
    let name = chat_name.unwrap_or_else(|| {
        if chat_id.len() >= 8 {
            &chat_id[..8]
        } else {
            chat_id
        }
    });
    format!("WhatsApp {}:{}", chat_type, name)
}

// ---------------------------------------------------------------------------
// Phone validation / formatting
// ---------------------------------------------------------------------------

/// Return `true` if `value` normalizes to a valid WhatsApp phone number.
///
/// Must be E.164 format with 10-15 digits (after the `+`).
pub fn is_valid_whatsapp_number(value: &str) -> bool {
    let Some(normalized) = normalize_whatsapp_target(value) else {
        return false;
    };
    if !normalized.starts_with('+') {
        return false;
    }
    let digits = normalized.trim_start_matches('+');
    let len = digits.len();
    len >= 10 && len <= 15 && digits.chars().all(|c| c.is_ascii_digit())
}

/// Format a phone number for WhatsApp display.
///
/// Numbers longer than 10 digits are split into country-code + local
/// portions separated by spaces.
pub fn format_whatsapp_phone_number(phone_number: &str) -> String {
    let normalized = normalize_e164(phone_number);
    if normalized.is_empty() {
        return phone_number.to_string();
    }
    let digits = normalized.trim_start_matches('+');
    if digits.len() <= 10 {
        return normalized;
    }
    let country_len = digits.len() - 10;
    let country_code = &digits[..country_len];
    let rest = &digits[country_len..];
    format!("+{} {} {} {}", country_code, &rest[..3], &rest[3..6], &rest[6..])
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // --- normalize_e164 ---

    #[test]
    fn test_e164_empty() {
        assert_eq!(normalize_e164(""), "");
    }

    #[test]
    fn test_e164_preserve_plus() {
        assert_eq!(normalize_e164("+1234567890"), "+1234567890");
    }

    #[test]
    fn test_e164_remove_spaces_dashes() {
        assert_eq!(normalize_e164("+1 234-567-8901"), "+12345678901");
    }

    #[test]
    fn test_e164_remove_parens_dots() {
        assert_eq!(normalize_e164("+1 (234) 567.8901"), "+12345678901");
    }

    #[test]
    fn test_e164_add_plus_long() {
        assert_eq!(normalize_e164("12345678901"), "+12345678901");
    }

    #[test]
    fn test_e164_00_prefix() {
        assert_eq!(normalize_e164("0012345678901"), "+12345678901");
    }

    #[test]
    fn test_e164_short_unmodified() {
        assert_eq!(normalize_e164("123456"), "123456");
    }

    #[test]
    fn test_e164_remove_non_digit() {
        assert_eq!(normalize_e164("+1-234-ABC-567"), "+1234567");
    }

    #[test]
    fn test_e164_whitespace_only() {
        assert_eq!(normalize_e164("   "), "");
    }

    #[test]
    fn test_e164_letters_only() {
        assert_eq!(normalize_e164("abcdef"), "");
    }

    #[test]
    fn test_e164_plus_only() {
        assert_eq!(normalize_e164("+"), "+");
    }

    #[test]
    fn test_e164_ten_digits() {
        assert_eq!(normalize_e164("1234567890"), "+1234567890");
    }

    #[test]
    fn test_e164_nine_digits() {
        assert_eq!(normalize_e164("123456789"), "123456789");
    }

    // --- is_whatsapp_group_jid ---

    #[test]
    fn test_group_jid_valid() {
        assert!(is_whatsapp_group_jid("123456789-987654321@g.us"));
    }

    #[test]
    fn test_group_jid_simple() {
        assert!(is_whatsapp_group_jid("123456789@g.us"));
    }

    #[test]
    fn test_group_jid_whatsapp_prefix() {
        assert!(is_whatsapp_group_jid("whatsapp:123456789-987654321@g.us"));
    }

    #[test]
    fn test_group_jid_user_not_group() {
        assert!(!is_whatsapp_group_jid("41796666864:0@s.whatsapp.net"));
    }

    #[test]
    fn test_group_jid_phone_not_group() {
        assert!(!is_whatsapp_group_jid("+1234567890"));
    }

    #[test]
    fn test_group_jid_invalid_alpha() {
        assert!(!is_whatsapp_group_jid("invalid@g.us"));
    }

    #[test]
    fn test_group_jid_invalid_mixed() {
        assert!(!is_whatsapp_group_jid("123-abc@g.us"));
    }

    #[test]
    fn test_group_jid_case_insensitive() {
        assert!(is_whatsapp_group_jid("123456789@G.US"));
    }

    #[test]
    fn test_group_jid_many_segments() {
        assert!(is_whatsapp_group_jid("1-2-3-4-5@g.us"));
    }

    #[test]
    fn test_group_jid_empty_local() {
        assert!(!is_whatsapp_group_jid("@g.us"));
    }

    #[test]
    fn test_group_jid_double_at() {
        assert!(!is_whatsapp_group_jid("12@34@g.us"));
    }

    #[test]
    fn test_group_jid_trailing_dash() {
        assert!(!is_whatsapp_group_jid("123-@g.us"));
    }

    #[test]
    fn test_group_jid_leading_dash() {
        assert!(!is_whatsapp_group_jid("-123@g.us"));
    }

    #[test]
    fn test_group_jid_consecutive_dashes() {
        assert!(!is_whatsapp_group_jid("123--456@g.us"));
    }

    // --- is_whatsapp_user_target ---

    #[test]
    fn test_user_target_standard() {
        assert!(is_whatsapp_user_target("41796666864:0@s.whatsapp.net"));
    }

    #[test]
    fn test_user_target_no_device() {
        assert!(is_whatsapp_user_target("41796666864@s.whatsapp.net"));
    }

    #[test]
    fn test_user_target_lid() {
        assert!(is_whatsapp_user_target("123456@lid"));
    }

    #[test]
    fn test_user_target_prefix() {
        assert!(is_whatsapp_user_target(
            "whatsapp:41796666864:0@s.whatsapp.net"
        ));
    }

    #[test]
    fn test_user_target_group_false() {
        assert!(!is_whatsapp_user_target("123456789-987654321@g.us"));
    }

    #[test]
    fn test_user_target_phone_false() {
        assert!(!is_whatsapp_user_target("+1234567890"));
    }

    #[test]
    fn test_user_target_lid_case() {
        assert!(is_whatsapp_user_target("123456@LID"));
    }

    #[test]
    fn test_user_target_domain_case() {
        assert!(is_whatsapp_user_target("41796666864@S.WHATSAPP.NET"));
    }

    // --- normalize_whatsapp_target ---

    #[test]
    fn test_target_empty() {
        assert_eq!(normalize_whatsapp_target(""), None);
    }

    #[test]
    fn test_target_whitespace() {
        assert_eq!(normalize_whatsapp_target("   "), None);
    }

    #[test]
    fn test_target_group_jid() {
        assert_eq!(
            normalize_whatsapp_target("123456789-987654321@g.us"),
            Some("123456789-987654321@g.us".to_string())
        );
    }

    #[test]
    fn test_target_user_jid() {
        assert_eq!(
            normalize_whatsapp_target("41796666864:0@s.whatsapp.net"),
            Some("+41796666864".to_string())
        );
    }

    #[test]
    fn test_target_phone() {
        assert_eq!(
            normalize_whatsapp_target("+1-234-567-8901"),
            Some("+12345678901".to_string())
        );
    }

    #[test]
    fn test_target_strip_prefix() {
        assert_eq!(
            normalize_whatsapp_target("whatsapp:+1234567890"),
            Some("+1234567890".to_string())
        );
    }

    #[test]
    fn test_target_unknown_jid() {
        assert_eq!(normalize_whatsapp_target("unknown@domain.com"), None);
    }

    #[test]
    fn test_target_invalid_phone() {
        assert_eq!(normalize_whatsapp_target("abc"), None);
    }

    #[test]
    fn test_target_multiple_prefixes() {
        assert_eq!(
            normalize_whatsapp_target("whatsapp:whatsapp:+1234567890"),
            Some("+1234567890".to_string())
        );
    }

    #[test]
    fn test_target_device_parts() {
        assert_eq!(
            normalize_whatsapp_target("41796666864:15@s.whatsapp.net"),
            Some("+41796666864".to_string())
        );
    }

    #[test]
    fn test_target_lid_short() {
        assert_eq!(
            normalize_whatsapp_target("123456789@lid"),
            Some("123456789".to_string())
        );
    }

    #[test]
    fn test_target_lid_long() {
        assert_eq!(
            normalize_whatsapp_target("1234567890@lid"),
            Some("+1234567890".to_string())
        );
    }

    #[test]
    fn test_target_empty_after_strip() {
        assert_eq!(normalize_whatsapp_target("whatsapp:"), None);
    }

    #[test]
    fn test_target_at_sign_only() {
        assert_eq!(normalize_whatsapp_target("@"), None);
    }

    // --- format_whatsapp_id ---

    #[test]
    fn test_format_group() {
        assert_eq!(
            format_whatsapp_id("123456789-987654321@g.us"),
            "group:123456789-987654321@g.us"
        );
    }

    #[test]
    fn test_format_user() {
        assert_eq!(
            format_whatsapp_id("41796666864:0@s.whatsapp.net"),
            "+41796666864"
        );
    }

    #[test]
    fn test_format_invalid() {
        assert_eq!(format_whatsapp_id("invalid"), "invalid");
    }

    // --- chat type ---

    #[test]
    fn test_chat_type_group() {
        assert_eq!(
            get_whatsapp_chat_type("123456789-987654321@g.us"),
            WhatsAppChatKind::Group
        );
    }

    #[test]
    fn test_chat_type_user() {
        assert_eq!(
            get_whatsapp_chat_type("+1234567890"),
            WhatsAppChatKind::User
        );
    }

    #[test]
    fn test_is_group_true() {
        assert!(is_whatsapp_group("123456789-987654321@g.us"));
    }

    #[test]
    fn test_is_group_false() {
        assert!(!is_whatsapp_group("+1234567890"));
    }

    // --- build_whatsapp_user_jid ---

    #[test]
    fn test_build_jid_e164() {
        assert_eq!(
            build_whatsapp_user_jid("+1234567890"),
            "1234567890@s.whatsapp.net"
        );
    }

    #[test]
    fn test_build_jid_no_plus() {
        assert_eq!(
            build_whatsapp_user_jid("1234567890"),
            "1234567890@s.whatsapp.net"
        );
    }

    #[test]
    fn test_build_jid_strip() {
        assert_eq!(
            build_whatsapp_user_jid("+1-234-567-8901"),
            "12345678901@s.whatsapp.net"
        );
    }

    // --- chunk_whatsapp_text ---

    #[test]
    fn test_chunk_empty() {
        assert!(chunk_whatsapp_text("", None).is_empty());
    }

    #[test]
    fn test_chunk_whitespace() {
        assert!(chunk_whatsapp_text("   ", None).is_empty());
    }

    #[test]
    fn test_chunk_short() {
        assert_eq!(chunk_whatsapp_text("Hello world", None), vec!["Hello world"]);
    }

    #[test]
    fn test_chunk_limit_constant() {
        assert_eq!(WHATSAPP_TEXT_CHUNK_LIMIT, 4096);
    }

    #[test]
    fn test_chunk_splits_long() {
        let text = "a".repeat(5000);
        let chunks = chunk_whatsapp_text(&text, Some(2000));
        assert!(chunks.len() > 1);
        assert!(chunks.iter().all(|c| c.len() <= 2000));
    }

    #[test]
    fn test_chunk_paragraph_breaks() {
        let text = "Paragraph 1.\n\nParagraph 2.";
        let chunks = chunk_whatsapp_text(text, Some(20));
        assert!(chunks.contains(&"Paragraph 1.".to_string()));
        assert!(chunks.contains(&"Paragraph 2.".to_string()));
    }

    #[test]
    fn test_chunk_sentence_breaks() {
        let text = "First sentence. Second sentence.";
        let chunks = chunk_whatsapp_text(text, Some(20));
        assert!(chunks[0].ends_with('.'));
    }

    #[test]
    fn test_chunk_trimmed() {
        let text = "Word1\n\nWord2";
        let chunks = chunk_whatsapp_text(text, Some(10));
        assert!(chunks.iter().all(|c| c == c.trim()));
    }

    #[test]
    fn test_chunk_no_empty() {
        let text = "Hello\n\n\n\nWorld";
        let chunks = chunk_whatsapp_text(text, Some(10));
        assert!(chunks.iter().all(|c| !c.is_empty()));
    }

    #[test]
    fn test_chunk_exactly_at_limit() {
        let text = "a".repeat(4096);
        let chunks = chunk_whatsapp_text(&text, None);
        assert_eq!(chunks.len(), 1);
    }

    #[test]
    fn test_chunk_one_over() {
        let text = "a".repeat(4097);
        let chunks = chunk_whatsapp_text(&text, None);
        assert_eq!(chunks.len(), 2);
    }

    // --- truncate_text ---

    #[test]
    fn test_truncate_short() {
        assert_eq!(truncate_text("Hello", 10), "Hello");
    }

    #[test]
    fn test_truncate_long() {
        assert_eq!(truncate_text("Hello World", 8), "Hello...");
    }

    #[test]
    fn test_truncate_exact() {
        assert_eq!(truncate_text("Hello", 5), "Hello");
    }

    #[test]
    fn test_truncate_3() {
        assert_eq!(truncate_text("Hello", 3), "...");
    }

    #[test]
    fn test_truncate_1() {
        assert_eq!(truncate_text("Hello", 1), ".");
    }

    #[test]
    fn test_truncate_2() {
        assert_eq!(truncate_text("Hello", 2), "..");
    }

    #[test]
    fn test_truncate_0() {
        assert_eq!(truncate_text("Hello", 0), "");
    }

    // --- resolve_whatsapp_system_location ---

    #[test]
    fn test_location_group_name() {
        assert_eq!(
            resolve_whatsapp_system_location(
                WhatsAppChatKind::Group,
                "123456789-987654321@g.us",
                Some("My Group")
            ),
            "WhatsApp group:My Group"
        );
    }

    #[test]
    fn test_location_user_name() {
        assert_eq!(
            resolve_whatsapp_system_location(WhatsAppChatKind::User, "+1234567890", Some("John")),
            "WhatsApp user:John"
        );
    }

    #[test]
    fn test_location_truncated_id() {
        assert_eq!(
            resolve_whatsapp_system_location(WhatsAppChatKind::User, "12345678901234567890", None),
            "WhatsApp user:12345678"
        );
    }

    #[test]
    fn test_location_short_id() {
        assert_eq!(
            resolve_whatsapp_system_location(WhatsAppChatKind::User, "1234", None),
            "WhatsApp user:1234"
        );
    }

    // --- is_valid_whatsapp_number ---

    #[test]
    fn test_valid_number_e164() {
        assert!(is_valid_whatsapp_number("+12345678901"));
    }

    #[test]
    fn test_valid_number_normalizes() {
        assert!(is_valid_whatsapp_number("12345678901"));
    }

    #[test]
    fn test_valid_number_too_short() {
        assert!(!is_valid_whatsapp_number("+123456"));
    }

    #[test]
    fn test_valid_number_too_long() {
        assert!(!is_valid_whatsapp_number("+1234567890123456"));
    }

    #[test]
    fn test_valid_number_group_jid() {
        assert!(!is_valid_whatsapp_number("123456789-987654321@g.us"));
    }

    #[test]
    fn test_valid_number_empty() {
        assert!(!is_valid_whatsapp_number(""));
    }

    #[test]
    fn test_valid_number_ten_digits() {
        assert!(is_valid_whatsapp_number("+1234567890"));
    }

    #[test]
    fn test_valid_number_fifteen() {
        assert!(is_valid_whatsapp_number("+123456789012345"));
    }

    // --- format_whatsapp_phone_number ---

    #[test]
    fn test_format_phone_long() {
        let result = format_whatsapp_phone_number("+12345678901");
        assert!(result.contains(' '));
    }

    #[test]
    fn test_format_phone_short() {
        assert_eq!(format_whatsapp_phone_number("+1234567890"), "+1234567890");
    }

    #[test]
    fn test_format_phone_invalid() {
        assert_eq!(format_whatsapp_phone_number("abc"), "abc");
    }

    #[test]
    fn test_format_phone_specific() {
        assert_eq!(
            format_whatsapp_phone_number("+12345678901"),
            "+1 234 567 8901"
        );
    }

    #[test]
    fn test_format_phone_two_digit_cc() {
        assert_eq!(
            format_whatsapp_phone_number("+441234567890"),
            "+44 123 456 7890"
        );
    }
}
