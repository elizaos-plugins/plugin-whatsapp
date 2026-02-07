//! WhatsApp multi-account management.
//!
//! Provides configuration resolution, token lookup, allowlist management,
//! and multi-account orchestration for the WhatsApp Cloud API plugin.

use serde::{Deserialize, Serialize};
use std::collections::{BTreeSet, HashMap};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Default account identifier used when no specific account is configured.
pub const DEFAULT_ACCOUNT_ID: &str = "default";

// ---------------------------------------------------------------------------
// Token source
// ---------------------------------------------------------------------------

/// Indicates where a resolved token was found.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum WhatsAppTokenSource {
    Config,
    Env,
    Character,
    None,
}

// ---------------------------------------------------------------------------
// Configuration types
// ---------------------------------------------------------------------------

/// DM access policy.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DmPolicy {
    Open,
    Allowlist,
    Pairing,
    Disabled,
}

/// Group message access policy.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum GroupPolicy {
    Open,
    Allowlist,
    Disabled,
}

/// Runtime configuration for a single WhatsApp group.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WhatsAppGroupRuntimeConfig {
    /// If `false`, ignore messages from this group.
    pub enabled: Option<bool>,
    /// Allowlist for users in this group.
    pub allow_from: Option<Vec<String>>,
    /// Require bot mention to respond.
    pub require_mention: Option<bool>,
    /// Custom system prompt for this group.
    pub system_prompt: Option<String>,
    /// Skills enabled for this group.
    pub skills: Option<Vec<String>>,
}

/// Configuration for a single WhatsApp account (runtime resolution).
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WhatsAppAccountRuntimeConfig {
    /// Optional display name.
    pub name: Option<String>,
    /// If `false`, do not start this account.
    pub enabled: Option<bool>,
    /// WhatsApp Cloud API access token.
    pub access_token: Option<String>,
    /// Phone number ID from WhatsApp Business.
    pub phone_number_id: Option<String>,
    /// Business account ID.
    pub business_account_id: Option<String>,
    /// Webhook verification token.
    pub webhook_verify_token: Option<String>,
    /// API version to use.
    pub api_version: Option<String>,
    /// Allowlist for DM senders.
    pub allow_from: Option<Vec<String>>,
    /// Allowlist for groups.
    pub group_allow_from: Option<Vec<String>>,
    /// DM access policy.
    pub dm_policy: Option<DmPolicy>,
    /// Group message access policy.
    pub group_policy: Option<GroupPolicy>,
    /// Max media size in MB.
    pub media_max_mb: Option<u32>,
    /// Text chunk limit for messages.
    pub text_chunk_limit: Option<usize>,
    /// Group-specific configurations.
    pub groups: Option<HashMap<String, WhatsAppGroupRuntimeConfig>>,
}

/// Top-level multi-account WhatsApp configuration.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WhatsAppMultiAccountConfig {
    pub enabled: Option<bool>,
    pub access_token: Option<String>,
    pub phone_number_id: Option<String>,
    pub business_account_id: Option<String>,
    pub webhook_verify_token: Option<String>,
    pub api_version: Option<String>,
    pub dm_policy: Option<DmPolicy>,
    pub group_policy: Option<GroupPolicy>,
    pub media_max_mb: Option<u32>,
    pub text_chunk_limit: Option<usize>,
    /// Per-account configuration overrides.
    pub accounts: Option<HashMap<String, WhatsAppAccountRuntimeConfig>>,
    /// Group configurations at base level.
    pub groups: Option<HashMap<String, WhatsAppGroupRuntimeConfig>>,
}

// ---------------------------------------------------------------------------
// Token resolution result
// ---------------------------------------------------------------------------

/// Result of token resolution.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WhatsAppTokenResolution {
    pub token: String,
    pub source: WhatsAppTokenSource,
}

// ---------------------------------------------------------------------------
// Resolved account
// ---------------------------------------------------------------------------

/// A fully resolved WhatsApp account ready for use.
#[derive(Debug, Clone)]
pub struct ResolvedWhatsAppAccount {
    pub account_id: String,
    pub enabled: bool,
    pub name: Option<String>,
    pub access_token: String,
    pub phone_number_id: String,
    pub business_account_id: Option<String>,
    pub token_source: WhatsAppTokenSource,
    pub configured: bool,
    pub config: WhatsAppAccountRuntimeConfig,
}

// ---------------------------------------------------------------------------
// Access check result
// ---------------------------------------------------------------------------

/// Result of a WhatsApp access check.
#[derive(Debug, Clone)]
pub struct WhatsAppAccessCheckResult {
    pub allowed: bool,
    pub pairing_code: Option<String>,
    pub new_pairing_request: Option<bool>,
    pub reply_message: Option<String>,
}

// ---------------------------------------------------------------------------
// Runtime trait
// ---------------------------------------------------------------------------

/// Minimal trait expected from an ElizaOS agent runtime.
pub trait AgentRuntime {
    /// Get a runtime/environment setting by key.
    fn get_setting(&self, key: &str) -> Option<String>;

    /// Get the WhatsApp settings from character configuration.
    fn get_whatsapp_config(&self) -> Option<WhatsAppMultiAccountConfig>;
}

// ---------------------------------------------------------------------------
// Account ID helpers
// ---------------------------------------------------------------------------

/// Normalize an account ID.
///
/// Returns [`DEFAULT_ACCOUNT_ID`] for `None`, empty, whitespace-only, or
/// `"default"` inputs. Otherwise returns the trimmed lower-cased value.
pub fn normalize_account_id(account_id: Option<&str>) -> String {
    match account_id {
        None => DEFAULT_ACCOUNT_ID.to_string(),
        Some(id) => {
            let trimmed = id.trim().to_lowercase();
            if trimmed.is_empty() || trimmed == "default" {
                DEFAULT_ACCOUNT_ID.to_string()
            } else {
                trimmed
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Multi-account config extraction
// ---------------------------------------------------------------------------

/// Extract the multi-account configuration from the runtime.
pub fn get_multi_account_config(runtime: &dyn AgentRuntime) -> WhatsAppMultiAccountConfig {
    runtime
        .get_whatsapp_config()
        .unwrap_or_default()
}

// ---------------------------------------------------------------------------
// Account listing
// ---------------------------------------------------------------------------

/// List all configured account IDs (sorted).
pub fn list_whatsapp_account_ids(runtime: &dyn AgentRuntime) -> Vec<String> {
    let config = get_multi_account_config(runtime);
    let mut ids = BTreeSet::new();

    let env_token = runtime.get_setting("WHATSAPP_ACCESS_TOKEN");
    let env_phone = runtime.get_setting("WHATSAPP_PHONE_NUMBER_ID");

    let base_configured = config
        .access_token
        .as_ref()
        .map_or(false, |t| !t.trim().is_empty())
        && config
            .phone_number_id
            .as_ref()
            .map_or(false, |p| !p.trim().is_empty());

    let env_configured = env_token.as_ref().map_or(false, |t| !t.trim().is_empty())
        && env_phone.as_ref().map_or(false, |p| !p.trim().is_empty());

    if base_configured || env_configured {
        ids.insert(DEFAULT_ACCOUNT_ID.to_string());
    }

    if let Some(ref accounts) = config.accounts {
        for key in accounts.keys() {
            if !key.is_empty() {
                ids.insert(normalize_account_id(Some(key)));
            }
        }
    }

    let result: Vec<String> = ids.into_iter().collect();
    if result.is_empty() {
        vec![DEFAULT_ACCOUNT_ID.to_string()]
    } else {
        result
    }
}

/// Resolve the default account ID to use.
pub fn resolve_default_whatsapp_account_id(runtime: &dyn AgentRuntime) -> String {
    let ids = list_whatsapp_account_ids(runtime);
    if ids.contains(&DEFAULT_ACCOUNT_ID.to_string()) {
        DEFAULT_ACCOUNT_ID.to_string()
    } else {
        ids.into_iter().next().unwrap_or_else(|| DEFAULT_ACCOUNT_ID.to_string())
    }
}

// ---------------------------------------------------------------------------
// Account-specific config lookup
// ---------------------------------------------------------------------------

/// Get the account-specific runtime configuration.
fn get_account_config(
    runtime: &dyn AgentRuntime,
    account_id: &str,
) -> Option<WhatsAppAccountRuntimeConfig> {
    let config = get_multi_account_config(runtime);
    let accounts = config.accounts.as_ref()?;

    // Direct match
    if let Some(acct) = accounts.get(account_id) {
        return Some(acct.clone());
    }

    // Normalized match
    let normalized = normalize_account_id(Some(account_id));
    for (key, val) in accounts {
        if normalize_account_id(Some(key)) == normalized {
            return Some(val.clone());
        }
    }

    None
}

// ---------------------------------------------------------------------------
// Token resolution
// ---------------------------------------------------------------------------

/// Resolve the access token for a WhatsApp account.
///
/// Resolution order:
/// 1. Account-level `accessToken`
/// 2. Base-level `accessToken` (default account only)
/// 3. Environment / runtime setting `WHATSAPP_ACCESS_TOKEN` (default only)
/// 4. `None`
pub fn resolve_whatsapp_token(
    runtime: &dyn AgentRuntime,
    account_id: &str,
) -> WhatsAppTokenResolution {
    let multi_config = get_multi_account_config(runtime);
    let account_config = get_account_config(runtime, account_id);

    // Account-level
    if let Some(ref acct) = account_config {
        if let Some(ref token) = acct.access_token {
            let trimmed = token.trim();
            if !trimmed.is_empty() {
                return WhatsAppTokenResolution {
                    token: trimmed.to_string(),
                    source: WhatsAppTokenSource::Config,
                };
            }
        }
    }

    // Default account fallbacks
    if account_id == DEFAULT_ACCOUNT_ID {
        if let Some(ref token) = multi_config.access_token {
            let trimmed = token.trim();
            if !trimmed.is_empty() {
                return WhatsAppTokenResolution {
                    token: trimmed.to_string(),
                    source: WhatsAppTokenSource::Config,
                };
            }
        }

        if let Some(env_token) = runtime.get_setting("WHATSAPP_ACCESS_TOKEN") {
            let trimmed = env_token.trim();
            if !trimmed.is_empty() {
                return WhatsAppTokenResolution {
                    token: trimmed.to_string(),
                    source: WhatsAppTokenSource::Env,
                };
            }
        }
    }

    WhatsAppTokenResolution {
        token: String::new(),
        source: WhatsAppTokenSource::None,
    }
}

// ---------------------------------------------------------------------------
// Config merging
// ---------------------------------------------------------------------------

/// Merge environment, base, and account-specific configuration.
fn merge_whatsapp_account_config(
    runtime: &dyn AgentRuntime,
    account_id: &str,
) -> WhatsAppAccountRuntimeConfig {
    let multi_config = get_multi_account_config(runtime);
    let account_config = get_account_config(runtime, account_id);

    // Environment settings
    let env_token = runtime.get_setting("WHATSAPP_ACCESS_TOKEN");
    let env_phone = runtime.get_setting("WHATSAPP_PHONE_NUMBER_ID");
    let env_business = runtime.get_setting("WHATSAPP_BUSINESS_ACCOUNT_ID");
    let env_webhook = runtime.get_setting("WHATSAPP_WEBHOOK_VERIFY_TOKEN");
    let env_dm_policy = runtime
        .get_setting("WHATSAPP_DM_POLICY")
        .and_then(|s| serde_json::from_value(serde_json::Value::String(s)).ok());
    let env_group_policy = runtime
        .get_setting("WHATSAPP_GROUP_POLICY")
        .and_then(|s| serde_json::from_value(serde_json::Value::String(s)).ok());

    // Merge order: env < base < account (later values override)
    let mut merged = WhatsAppAccountRuntimeConfig::default();

    // Environment layer
    if let Some(t) = env_token.filter(|s| !s.is_empty()) {
        merged.access_token = Some(t);
    }
    if let Some(p) = env_phone.filter(|s| !s.is_empty()) {
        merged.phone_number_id = Some(p);
    }
    if let Some(b) = env_business.filter(|s| !s.is_empty()) {
        merged.business_account_id = Some(b);
    }
    if let Some(w) = env_webhook.filter(|s| !s.is_empty()) {
        merged.webhook_verify_token = Some(w);
    }
    if let Some(dp) = env_dm_policy {
        merged.dm_policy = Some(dp);
    }
    if let Some(gp) = env_group_policy {
        merged.group_policy = Some(gp);
    }

    // Base config layer
    macro_rules! merge_opt {
        ($field:ident) => {
            if multi_config.$field.is_some() {
                merged.$field = multi_config.$field.clone();
            }
        };
    }
    merge_opt!(enabled);
    merge_opt!(access_token);
    merge_opt!(phone_number_id);
    merge_opt!(business_account_id);
    merge_opt!(webhook_verify_token);
    merge_opt!(api_version);
    merge_opt!(dm_policy);
    merge_opt!(group_policy);
    merge_opt!(media_max_mb);
    merge_opt!(text_chunk_limit);
    merge_opt!(groups);

    // Account-level overrides
    if let Some(acct) = account_config {
        macro_rules! merge_acct {
            ($field:ident) => {
                if acct.$field.is_some() {
                    merged.$field = acct.$field.clone();
                }
            };
        }
        merge_acct!(name);
        merge_acct!(enabled);
        merge_acct!(access_token);
        merge_acct!(phone_number_id);
        merge_acct!(business_account_id);
        merge_acct!(webhook_verify_token);
        merge_acct!(api_version);
        merge_acct!(allow_from);
        merge_acct!(group_allow_from);
        merge_acct!(dm_policy);
        merge_acct!(group_policy);
        merge_acct!(media_max_mb);
        merge_acct!(text_chunk_limit);
        merge_acct!(groups);
    }

    merged
}

// ---------------------------------------------------------------------------
// Full account resolution
// ---------------------------------------------------------------------------

/// Resolve a complete WhatsApp account configuration.
pub fn resolve_whatsapp_account(
    runtime: &dyn AgentRuntime,
    account_id: Option<&str>,
) -> ResolvedWhatsAppAccount {
    let normalized_id = normalize_account_id(account_id);
    let multi_config = get_multi_account_config(runtime);

    let base_enabled = multi_config.enabled != Some(false);
    let merged = merge_whatsapp_account_config(runtime, &normalized_id);
    let account_enabled = merged.enabled != Some(false);
    let enabled = base_enabled && account_enabled;

    let resolution = resolve_whatsapp_token(runtime, &normalized_id);
    let phone_number_id = merged
        .phone_number_id
        .as_deref()
        .unwrap_or("")
        .trim()
        .to_string();

    let configured = !resolution.token.is_empty() && !phone_number_id.is_empty();

    let name = merged
        .name
        .as_ref()
        .map(|n| n.trim().to_string())
        .filter(|n| !n.is_empty());

    let business_account_id = merged
        .business_account_id
        .as_ref()
        .map(|b| b.trim().to_string())
        .filter(|b| !b.is_empty());

    ResolvedWhatsAppAccount {
        account_id: normalized_id,
        enabled,
        name,
        access_token: resolution.token,
        phone_number_id,
        business_account_id,
        token_source: resolution.source,
        configured,
        config: merged,
    }
}

// ---------------------------------------------------------------------------
// Listing enabled accounts
// ---------------------------------------------------------------------------

/// Return all enabled **and** configured WhatsApp accounts.
pub fn list_enabled_whatsapp_accounts(runtime: &dyn AgentRuntime) -> Vec<ResolvedWhatsAppAccount> {
    list_whatsapp_account_ids(runtime)
        .into_iter()
        .map(|id| resolve_whatsapp_account(runtime, Some(&id)))
        .filter(|a| a.enabled && a.configured)
        .collect()
}

/// Return `true` when more than one account is enabled and configured.
pub fn is_multi_account_enabled(runtime: &dyn AgentRuntime) -> bool {
    list_enabled_whatsapp_accounts(runtime).len() > 1
}

// ---------------------------------------------------------------------------
// Group config resolution
// ---------------------------------------------------------------------------

/// Resolve the configuration for a specific group.
///
/// Checks account-level groups first, then falls back to base-level groups.
pub fn resolve_whatsapp_group_config(
    runtime: &dyn AgentRuntime,
    account_id: &str,
    group_id: &str,
) -> Option<WhatsAppGroupRuntimeConfig> {
    let multi_config = get_multi_account_config(runtime);
    let account_config = get_account_config(runtime, account_id);

    // Account-level groups
    if let Some(ref acct) = account_config {
        if let Some(ref groups) = acct.groups {
            if let Some(group) = groups.get(group_id) {
                return Some(group.clone());
            }
        }
    }

    // Base-level groups
    if let Some(ref groups) = multi_config.groups {
        if let Some(group) = groups.get(group_id) {
            return Some(group.clone());
        }
    }

    None
}

// ---------------------------------------------------------------------------
// Allowlist management
// ---------------------------------------------------------------------------

/// Check if a user is allowed based on policy and allowlists.
///
/// For group messages, checks `group_policy` and group/account allowlists.
/// For DMs, checks `dm_policy` and the DM allowlist.
pub fn is_whatsapp_user_allowed(
    identifier: &str,
    account_config: &WhatsAppAccountRuntimeConfig,
    is_group: bool,
    group_config: Option<&WhatsAppGroupRuntimeConfig>,
) -> bool {
    if is_group {
        let policy = account_config.group_policy.unwrap_or(GroupPolicy::Allowlist);
        match policy {
            GroupPolicy::Disabled => return false,
            GroupPolicy::Open => return true,
            GroupPolicy::Allowlist => {}
        }

        // Group-specific allowlist
        if let Some(gc) = group_config {
            if let Some(ref allow) = gc.allow_from {
                if !allow.is_empty() {
                    return allow.iter().any(|a| a == identifier);
                }
            }
        }

        // Account-level group allowlist
        if let Some(ref allow) = account_config.group_allow_from {
            if !allow.is_empty() {
                return allow.iter().any(|a| a == identifier);
            }
        }

        return policy != GroupPolicy::Allowlist;
    }

    // DM handling
    let policy = account_config.dm_policy.unwrap_or(DmPolicy::Pairing);
    match policy {
        DmPolicy::Disabled => false,
        DmPolicy::Open => true,
        DmPolicy::Pairing => true,
        DmPolicy::Allowlist => {
            if let Some(ref allow) = account_config.allow_from {
                allow.iter().any(|a| a == identifier)
            } else {
                false
            }
        }
    }
}

/// Check if a group is allowed based on policy and group allowlists.
pub fn is_whatsapp_group_allowed(
    group_id: &str,
    account_config: &WhatsAppAccountRuntimeConfig,
    group_config: Option<&WhatsAppGroupRuntimeConfig>,
) -> bool {
    let policy = account_config.group_policy.unwrap_or(GroupPolicy::Allowlist);
    match policy {
        GroupPolicy::Disabled => false,
        GroupPolicy::Open => true,
        GroupPolicy::Allowlist => {
            // Group-specific config takes precedence
            if let Some(gc) = group_config {
                return gc.enabled != Some(false);
            }
            // Account-level group allowlist
            if let Some(ref allow) = account_config.group_allow_from {
                return allow.iter().any(|a| a == group_id);
            }
            false
        }
    }
}

/// Check if bot mention is required to respond in a group.
pub fn is_whatsapp_mention_required(
    _account_config: &WhatsAppAccountRuntimeConfig,
    group_config: Option<&WhatsAppGroupRuntimeConfig>,
) -> bool {
    group_config
        .and_then(|gc| gc.require_mention)
        .unwrap_or(false)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // --- Test runtime mock ---

    struct MockRuntime {
        config: Option<WhatsAppMultiAccountConfig>,
        settings: HashMap<String, String>,
    }

    impl MockRuntime {
        fn new() -> Self {
            Self {
                config: None,
                settings: HashMap::new(),
            }
        }

        fn with_config(mut self, config: WhatsAppMultiAccountConfig) -> Self {
            self.config = Some(config);
            self
        }

        fn with_setting(mut self, key: &str, value: &str) -> Self {
            self.settings.insert(key.to_string(), value.to_string());
            self
        }
    }

    impl AgentRuntime for MockRuntime {
        fn get_setting(&self, key: &str) -> Option<String> {
            self.settings.get(key).cloned()
        }

        fn get_whatsapp_config(&self) -> Option<WhatsAppMultiAccountConfig> {
            self.config.clone()
        }
    }

    // --- normalize_account_id ---

    #[test]
    fn test_normalize_none() {
        assert_eq!(normalize_account_id(None), DEFAULT_ACCOUNT_ID);
    }

    #[test]
    fn test_normalize_empty() {
        assert_eq!(normalize_account_id(Some("")), DEFAULT_ACCOUNT_ID);
    }

    #[test]
    fn test_normalize_whitespace() {
        assert_eq!(normalize_account_id(Some("   ")), DEFAULT_ACCOUNT_ID);
    }

    #[test]
    fn test_normalize_lowercase() {
        assert_eq!(normalize_account_id(Some("MyAccount")), "myaccount");
    }

    #[test]
    fn test_normalize_trim() {
        assert_eq!(normalize_account_id(Some("  account  ")), "account");
    }

    #[test]
    fn test_normalize_default_keyword() {
        assert_eq!(normalize_account_id(Some("default")), DEFAULT_ACCOUNT_ID);
        assert_eq!(normalize_account_id(Some("DEFAULT")), DEFAULT_ACCOUNT_ID);
    }

    // --- list_whatsapp_account_ids ---

    #[test]
    fn test_list_no_accounts() {
        let rt = MockRuntime::new();
        assert_eq!(list_whatsapp_account_ids(&rt), vec![DEFAULT_ACCOUNT_ID]);
    }

    #[test]
    fn test_list_base_credentials() {
        let config = WhatsAppMultiAccountConfig {
            access_token: Some("test-token".to_string()),
            phone_number_id: Some("123456789".to_string()),
            ..Default::default()
        };
        let rt = MockRuntime::new().with_config(config);
        let ids = list_whatsapp_account_ids(&rt);
        assert!(ids.contains(&DEFAULT_ACCOUNT_ID.to_string()));
    }

    #[test]
    fn test_list_env_credentials() {
        let rt = MockRuntime::new()
            .with_setting("WHATSAPP_ACCESS_TOKEN", "env-token")
            .with_setting("WHATSAPP_PHONE_NUMBER_ID", "123456789");
        let ids = list_whatsapp_account_ids(&rt);
        assert!(ids.contains(&DEFAULT_ACCOUNT_ID.to_string()));
    }

    #[test]
    fn test_list_named_accounts() {
        let mut accounts = HashMap::new();
        accounts.insert(
            "business1".to_string(),
            WhatsAppAccountRuntimeConfig {
                phone_number_id: Some("111".to_string()),
                ..Default::default()
            },
        );
        accounts.insert(
            "business2".to_string(),
            WhatsAppAccountRuntimeConfig {
                phone_number_id: Some("222".to_string()),
                ..Default::default()
            },
        );
        let config = WhatsAppMultiAccountConfig {
            accounts: Some(accounts),
            ..Default::default()
        };
        let rt = MockRuntime::new().with_config(config);
        let ids = list_whatsapp_account_ids(&rt);
        assert!(ids.contains(&"business1".to_string()));
        assert!(ids.contains(&"business2".to_string()));
    }

    #[test]
    fn test_list_sorted() {
        let mut accounts = HashMap::new();
        accounts.insert("zebra".to_string(), WhatsAppAccountRuntimeConfig::default());
        accounts.insert("alpha".to_string(), WhatsAppAccountRuntimeConfig::default());
        accounts.insert("mango".to_string(), WhatsAppAccountRuntimeConfig::default());
        let config = WhatsAppMultiAccountConfig {
            accounts: Some(accounts),
            ..Default::default()
        };
        let rt = MockRuntime::new().with_config(config);
        let ids = list_whatsapp_account_ids(&rt);
        assert_eq!(ids, vec!["alpha", "mango", "zebra"]);
    }

    // --- resolve_whatsapp_token ---

    #[test]
    fn test_token_account_first() {
        let mut accounts = HashMap::new();
        accounts.insert(
            "business".to_string(),
            WhatsAppAccountRuntimeConfig {
                access_token: Some("business-token".to_string()),
                ..Default::default()
            },
        );
        let config = WhatsAppMultiAccountConfig {
            access_token: Some("base-token".to_string()),
            accounts: Some(accounts),
            ..Default::default()
        };
        let rt = MockRuntime::new().with_config(config);
        let result = resolve_whatsapp_token(&rt, "business");
        assert_eq!(result.token, "business-token");
        assert_eq!(result.source, WhatsAppTokenSource::Config);
    }

    #[test]
    fn test_token_base_for_default() {
        let config = WhatsAppMultiAccountConfig {
            access_token: Some("base-token".to_string()),
            ..Default::default()
        };
        let rt = MockRuntime::new().with_config(config);
        let result = resolve_whatsapp_token(&rt, DEFAULT_ACCOUNT_ID);
        assert_eq!(result.token, "base-token");
        assert_eq!(result.source, WhatsAppTokenSource::Config);
    }

    #[test]
    fn test_token_env_fallback() {
        let rt = MockRuntime::new().with_setting("WHATSAPP_ACCESS_TOKEN", "env-token");
        let result = resolve_whatsapp_token(&rt, DEFAULT_ACCOUNT_ID);
        assert_eq!(result.token, "env-token");
        assert_eq!(result.source, WhatsAppTokenSource::Env);
    }

    #[test]
    fn test_token_none() {
        let rt = MockRuntime::new();
        let result = resolve_whatsapp_token(&rt, "nonexistent");
        assert_eq!(result.token, "");
        assert_eq!(result.source, WhatsAppTokenSource::None);
    }

    #[test]
    fn test_token_trimmed() {
        let config = WhatsAppMultiAccountConfig {
            access_token: Some("  token-with-spaces  ".to_string()),
            ..Default::default()
        };
        let rt = MockRuntime::new().with_config(config);
        let result = resolve_whatsapp_token(&rt, DEFAULT_ACCOUNT_ID);
        assert_eq!(result.token, "token-with-spaces");
    }

    #[test]
    fn test_token_env_not_for_named() {
        let rt = MockRuntime::new().with_setting("WHATSAPP_ACCESS_TOKEN", "env-token");
        let result = resolve_whatsapp_token(&rt, "business");
        assert_eq!(result.token, "");
        assert_eq!(result.source, WhatsAppTokenSource::None);
    }

    // --- resolve_whatsapp_account ---

    #[test]
    fn test_resolve_merged() {
        let mut accounts = HashMap::new();
        accounts.insert(
            "business".to_string(),
            WhatsAppAccountRuntimeConfig {
                name: Some("My Business".to_string()),
                access_token: Some("business-token".to_string()),
                phone_number_id: Some("123456789".to_string()),
                dm_policy: Some(DmPolicy::Open),
                ..Default::default()
            },
        );
        let config = WhatsAppMultiAccountConfig {
            enabled: Some(true),
            dm_policy: Some(DmPolicy::Allowlist),
            accounts: Some(accounts),
            ..Default::default()
        };
        let rt = MockRuntime::new().with_config(config);
        let account = resolve_whatsapp_account(&rt, Some("business"));
        assert_eq!(account.account_id, "business");
        assert!(account.enabled);
        assert_eq!(account.name, Some("My Business".to_string()));
        assert_eq!(account.access_token, "business-token");
        assert_eq!(account.phone_number_id, "123456789");
        assert!(account.configured);
        assert_eq!(account.config.dm_policy, Some(DmPolicy::Open));
    }

    #[test]
    fn test_resolve_normalizes_id() {
        let rt = MockRuntime::new();
        let account = resolve_whatsapp_account(&rt, Some("  MyBusiness  "));
        assert_eq!(account.account_id, "mybusiness");
    }

    #[test]
    fn test_resolve_none_id() {
        let rt = MockRuntime::new();
        let account = resolve_whatsapp_account(&rt, None);
        assert_eq!(account.account_id, DEFAULT_ACCOUNT_ID);
    }

    #[test]
    fn test_resolve_base_disabled() {
        let mut accounts = HashMap::new();
        accounts.insert(
            "business".to_string(),
            WhatsAppAccountRuntimeConfig {
                enabled: Some(true),
                ..Default::default()
            },
        );
        let config = WhatsAppMultiAccountConfig {
            enabled: Some(false),
            accounts: Some(accounts),
            ..Default::default()
        };
        let rt = MockRuntime::new().with_config(config);
        let account = resolve_whatsapp_account(&rt, Some("business"));
        assert!(!account.enabled);
    }

    #[test]
    fn test_resolve_not_configured() {
        let mut accounts = HashMap::new();
        accounts.insert(
            "business".to_string(),
            WhatsAppAccountRuntimeConfig {
                name: Some("No Token".to_string()),
                ..Default::default()
            },
        );
        let config = WhatsAppMultiAccountConfig {
            accounts: Some(accounts),
            ..Default::default()
        };
        let rt = MockRuntime::new().with_config(config);
        let account = resolve_whatsapp_account(&rt, Some("business"));
        assert!(!account.configured);
    }

    #[test]
    fn test_resolve_both_required() {
        let mut accounts = HashMap::new();
        accounts.insert(
            "token_only".to_string(),
            WhatsAppAccountRuntimeConfig {
                access_token: Some("token".to_string()),
                ..Default::default()
            },
        );
        accounts.insert(
            "phone_only".to_string(),
            WhatsAppAccountRuntimeConfig {
                phone_number_id: Some("123".to_string()),
                ..Default::default()
            },
        );
        accounts.insert(
            "both".to_string(),
            WhatsAppAccountRuntimeConfig {
                access_token: Some("token".to_string()),
                phone_number_id: Some("123".to_string()),
                ..Default::default()
            },
        );
        let config = WhatsAppMultiAccountConfig {
            accounts: Some(accounts),
            ..Default::default()
        };
        let rt = MockRuntime::new().with_config(config);
        assert!(!resolve_whatsapp_account(&rt, Some("token_only")).configured);
        assert!(!resolve_whatsapp_account(&rt, Some("phone_only")).configured);
        assert!(resolve_whatsapp_account(&rt, Some("both")).configured);
    }

    #[test]
    fn test_resolve_env_settings() {
        let rt = MockRuntime::new()
            .with_setting("WHATSAPP_ACCESS_TOKEN", "env-token")
            .with_setting("WHATSAPP_PHONE_NUMBER_ID", "env-phone")
            .with_setting("WHATSAPP_BUSINESS_ACCOUNT_ID", "env-business");
        let account = resolve_whatsapp_account(&rt, None);
        assert_eq!(account.access_token, "env-token");
        assert_eq!(account.phone_number_id, "env-phone");
        assert_eq!(account.business_account_id, Some("env-business".to_string()));
    }

    // --- list_enabled_whatsapp_accounts ---

    #[test]
    fn test_enabled_only() {
        let mut accounts = HashMap::new();
        accounts.insert(
            "enabled1".to_string(),
            WhatsAppAccountRuntimeConfig {
                enabled: Some(true),
                access_token: Some("token1".to_string()),
                phone_number_id: Some("phone1".to_string()),
                ..Default::default()
            },
        );
        accounts.insert(
            "disabled".to_string(),
            WhatsAppAccountRuntimeConfig {
                enabled: Some(false),
                access_token: Some("token2".to_string()),
                phone_number_id: Some("phone2".to_string()),
                ..Default::default()
            },
        );
        accounts.insert(
            "unconfigured".to_string(),
            WhatsAppAccountRuntimeConfig {
                enabled: Some(true),
                ..Default::default()
            },
        );
        let config = WhatsAppMultiAccountConfig {
            accounts: Some(accounts),
            ..Default::default()
        };
        let rt = MockRuntime::new().with_config(config);
        let enabled = list_enabled_whatsapp_accounts(&rt);
        assert_eq!(enabled.len(), 1);
        assert_eq!(enabled[0].account_id, "enabled1");
    }

    // --- is_multi_account_enabled ---

    #[test]
    fn test_multi_single() {
        let config = WhatsAppMultiAccountConfig {
            access_token: Some("single-token".to_string()),
            phone_number_id: Some("single-phone".to_string()),
            ..Default::default()
        };
        let rt = MockRuntime::new().with_config(config);
        assert!(!is_multi_account_enabled(&rt));
    }

    #[test]
    fn test_multi_multiple() {
        let mut accounts = HashMap::new();
        accounts.insert(
            "business".to_string(),
            WhatsAppAccountRuntimeConfig {
                access_token: Some("business-token".to_string()),
                phone_number_id: Some("business-phone".to_string()),
                ..Default::default()
            },
        );
        let config = WhatsAppMultiAccountConfig {
            access_token: Some("default-token".to_string()),
            phone_number_id: Some("default-phone".to_string()),
            accounts: Some(accounts),
            ..Default::default()
        };
        let rt = MockRuntime::new().with_config(config);
        assert!(is_multi_account_enabled(&rt));
    }

    // --- is_whatsapp_user_allowed ---

    #[test]
    fn test_user_open() {
        let config = WhatsAppAccountRuntimeConfig {
            dm_policy: Some(DmPolicy::Open),
            ..Default::default()
        };
        assert!(is_whatsapp_user_allowed("+1234567890", &config, false, None));
    }

    #[test]
    fn test_user_disabled() {
        let config = WhatsAppAccountRuntimeConfig {
            dm_policy: Some(DmPolicy::Disabled),
            ..Default::default()
        };
        assert!(!is_whatsapp_user_allowed("+1234567890", &config, false, None));
    }

    #[test]
    fn test_user_allowlist_in() {
        let config = WhatsAppAccountRuntimeConfig {
            dm_policy: Some(DmPolicy::Allowlist),
            allow_from: Some(vec!["+1234567890".to_string()]),
            ..Default::default()
        };
        assert!(is_whatsapp_user_allowed("+1234567890", &config, false, None));
    }

    #[test]
    fn test_user_allowlist_out() {
        let config = WhatsAppAccountRuntimeConfig {
            dm_policy: Some(DmPolicy::Allowlist),
            allow_from: Some(vec!["+0987654321".to_string()]),
            ..Default::default()
        };
        assert!(!is_whatsapp_user_allowed("+1234567890", &config, false, None));
    }

    #[test]
    fn test_user_pairing_default() {
        let config = WhatsAppAccountRuntimeConfig::default();
        assert!(is_whatsapp_user_allowed("+1234567890", &config, false, None));
    }

    #[test]
    fn test_group_allowlist_in() {
        let config = WhatsAppAccountRuntimeConfig {
            group_policy: Some(GroupPolicy::Allowlist),
            group_allow_from: Some(vec!["+1234567890".to_string()]),
            ..Default::default()
        };
        assert!(is_whatsapp_user_allowed("+1234567890", &config, true, None));
    }

    #[test]
    fn test_group_allowlist_out() {
        let config = WhatsAppAccountRuntimeConfig {
            group_policy: Some(GroupPolicy::Allowlist),
            group_allow_from: Some(vec!["+9999999999".to_string()]),
            ..Default::default()
        };
        assert!(!is_whatsapp_user_allowed("+1234567890", &config, true, None));
    }

    #[test]
    fn test_group_open() {
        let config = WhatsAppAccountRuntimeConfig {
            group_policy: Some(GroupPolicy::Open),
            ..Default::default()
        };
        assert!(is_whatsapp_user_allowed("+1234567890", &config, true, None));
    }

    #[test]
    fn test_group_disabled() {
        let config = WhatsAppAccountRuntimeConfig {
            group_policy: Some(GroupPolicy::Disabled),
            ..Default::default()
        };
        assert!(!is_whatsapp_user_allowed("+1234567890", &config, true, None));
    }

    #[test]
    fn test_group_specific_allowlist_in() {
        let config = WhatsAppAccountRuntimeConfig {
            group_policy: Some(GroupPolicy::Allowlist),
            ..Default::default()
        };
        let gc = WhatsAppGroupRuntimeConfig {
            allow_from: Some(vec!["+1234567890".to_string()]),
            ..Default::default()
        };
        assert!(is_whatsapp_user_allowed("+1234567890", &config, true, Some(&gc)));
    }

    #[test]
    fn test_group_specific_allowlist_out() {
        let config = WhatsAppAccountRuntimeConfig {
            group_policy: Some(GroupPolicy::Allowlist),
            ..Default::default()
        };
        let gc = WhatsAppGroupRuntimeConfig {
            allow_from: Some(vec!["+9999999999".to_string()]),
            ..Default::default()
        };
        assert!(!is_whatsapp_user_allowed("+1234567890", &config, true, Some(&gc)));
    }

    #[test]
    fn test_group_default_allowlist_denies() {
        let config = WhatsAppAccountRuntimeConfig::default();
        assert!(!is_whatsapp_user_allowed("+1234567890", &config, true, None));
    }

    // --- is_whatsapp_group_allowed ---

    #[test]
    fn test_group_allowed_open() {
        let config = WhatsAppAccountRuntimeConfig {
            group_policy: Some(GroupPolicy::Open),
            ..Default::default()
        };
        assert!(is_whatsapp_group_allowed("group@g.us", &config, None));
    }

    #[test]
    fn test_group_allowed_disabled() {
        let config = WhatsAppAccountRuntimeConfig {
            group_policy: Some(GroupPolicy::Disabled),
            ..Default::default()
        };
        assert!(!is_whatsapp_group_allowed("group@g.us", &config, None));
    }

    #[test]
    fn test_group_allowed_config_enabled() {
        let config = WhatsAppAccountRuntimeConfig {
            group_policy: Some(GroupPolicy::Allowlist),
            ..Default::default()
        };
        let gc = WhatsAppGroupRuntimeConfig {
            enabled: Some(true),
            ..Default::default()
        };
        assert!(is_whatsapp_group_allowed("group@g.us", &config, Some(&gc)));
    }

    #[test]
    fn test_group_allowed_config_disabled() {
        let config = WhatsAppAccountRuntimeConfig {
            group_policy: Some(GroupPolicy::Allowlist),
            ..Default::default()
        };
        let gc = WhatsAppGroupRuntimeConfig {
            enabled: Some(false),
            ..Default::default()
        };
        assert!(!is_whatsapp_group_allowed("group@g.us", &config, Some(&gc)));
    }

    #[test]
    fn test_group_allowed_in_allowlist() {
        let config = WhatsAppAccountRuntimeConfig {
            group_policy: Some(GroupPolicy::Allowlist),
            group_allow_from: Some(vec!["group@g.us".to_string()]),
            ..Default::default()
        };
        assert!(is_whatsapp_group_allowed("group@g.us", &config, None));
    }

    #[test]
    fn test_group_allowed_not_in_allowlist() {
        let config = WhatsAppAccountRuntimeConfig {
            group_policy: Some(GroupPolicy::Allowlist),
            group_allow_from: Some(vec!["other@g.us".to_string()]),
            ..Default::default()
        };
        assert!(!is_whatsapp_group_allowed("group@g.us", &config, None));
    }

    // --- is_whatsapp_mention_required ---

    #[test]
    fn test_mention_default() {
        let config = WhatsAppAccountRuntimeConfig::default();
        assert!(!is_whatsapp_mention_required(&config, None));
    }

    #[test]
    fn test_mention_required() {
        let config = WhatsAppAccountRuntimeConfig::default();
        let gc = WhatsAppGroupRuntimeConfig {
            require_mention: Some(true),
            ..Default::default()
        };
        assert!(is_whatsapp_mention_required(&config, Some(&gc)));
    }

    #[test]
    fn test_mention_not_required() {
        let config = WhatsAppAccountRuntimeConfig::default();
        let gc = WhatsAppGroupRuntimeConfig {
            require_mention: Some(false),
            ..Default::default()
        };
        assert!(!is_whatsapp_mention_required(&config, Some(&gc)));
    }

    // --- resolve_whatsapp_group_config ---

    #[test]
    fn test_group_config_account_level() {
        let mut groups = HashMap::new();
        groups.insert(
            "group1@g.us".to_string(),
            WhatsAppGroupRuntimeConfig {
                require_mention: Some(true),
                ..Default::default()
            },
        );
        let mut accounts = HashMap::new();
        accounts.insert(
            "business".to_string(),
            WhatsAppAccountRuntimeConfig {
                groups: Some(groups),
                ..Default::default()
            },
        );
        let config = WhatsAppMultiAccountConfig {
            accounts: Some(accounts),
            ..Default::default()
        };
        let rt = MockRuntime::new().with_config(config);
        let gc = resolve_whatsapp_group_config(&rt, "business", "group1@g.us");
        assert!(gc.is_some());
        assert_eq!(gc.unwrap().require_mention, Some(true));
    }

    #[test]
    fn test_group_config_base_fallback() {
        let mut groups = HashMap::new();
        groups.insert(
            "group1@g.us".to_string(),
            WhatsAppGroupRuntimeConfig {
                require_mention: Some(true),
                ..Default::default()
            },
        );
        let config = WhatsAppMultiAccountConfig {
            groups: Some(groups),
            ..Default::default()
        };
        let rt = MockRuntime::new().with_config(config);
        let gc = resolve_whatsapp_group_config(&rt, "business", "group1@g.us");
        assert!(gc.is_some());
        assert_eq!(gc.unwrap().require_mention, Some(true));
    }

    #[test]
    fn test_group_config_unknown() {
        let rt = MockRuntime::new();
        let gc = resolve_whatsapp_group_config(&rt, "business", "unknown@g.us");
        assert!(gc.is_none());
    }

    #[test]
    fn test_group_config_account_overrides_base() {
        let mut base_groups = HashMap::new();
        base_groups.insert(
            "group1@g.us".to_string(),
            WhatsAppGroupRuntimeConfig {
                require_mention: Some(false),
                ..Default::default()
            },
        );
        let mut acct_groups = HashMap::new();
        acct_groups.insert(
            "group1@g.us".to_string(),
            WhatsAppGroupRuntimeConfig {
                require_mention: Some(true),
                ..Default::default()
            },
        );
        let mut accounts = HashMap::new();
        accounts.insert(
            "business".to_string(),
            WhatsAppAccountRuntimeConfig {
                groups: Some(acct_groups),
                ..Default::default()
            },
        );
        let config = WhatsAppMultiAccountConfig {
            groups: Some(base_groups),
            accounts: Some(accounts),
            ..Default::default()
        };
        let rt = MockRuntime::new().with_config(config);
        let gc = resolve_whatsapp_group_config(&rt, "business", "group1@g.us");
        assert!(gc.is_some());
        assert_eq!(gc.unwrap().require_mention, Some(true));
    }
}
