"""Tests for WhatsApp multi-account management.

Mirrors the TypeScript ``accounts.test.ts`` test suite with full coverage
of account resolution, token lookup, allowlist management, and
multi-account orchestration.
"""

from __future__ import annotations

from typing import Any

import pytest

from elizaos_plugin_whatsapp.accounts import (
    DEFAULT_ACCOUNT_ID,
    ResolvedWhatsAppAccount,
    WhatsAppAccountRuntimeConfig,
    WhatsAppGroupRuntimeConfig,
    WhatsAppMultiAccountConfig,
    WhatsAppTokenResolution,
    WhatsAppTokenSource,
    get_multi_account_config,
    is_multi_account_enabled,
    is_whatsapp_group_allowed,
    is_whatsapp_mention_required,
    is_whatsapp_user_allowed,
    list_enabled_whatsapp_accounts,
    list_whatsapp_account_ids,
    normalize_account_id,
    resolve_default_whatsapp_account_id,
    resolve_whatsapp_account,
    resolve_whatsapp_group_config,
    resolve_whatsapp_token,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


class MockRuntime:
    """Lightweight mock for an agent runtime."""

    def __init__(
        self,
        character: dict[str, Any] | None = None,
        settings_map: dict[str, str] | None = None,
    ):
        self.character = character
        self._settings = settings_map or {}

    def get_setting(self, key: str) -> str | None:
        return self._settings.get(key)


def _rt(
    whatsapp: dict[str, Any] | None = None,
    *,
    settings_map: dict[str, str] | None = None,
) -> MockRuntime:
    """Shorthand to build a runtime with ``character.settings.whatsapp``."""
    character: dict[str, Any] | None = None
    if whatsapp is not None:
        character = {"settings": {"whatsapp": whatsapp}}
    elif whatsapp is None:
        character = {"settings": {}}
    return MockRuntime(character=character, settings_map=settings_map)


# ===================================================================
# normalizeAccountId
# ===================================================================


class TestNormalizeAccountId:
    """Tests for normalize_account_id."""

    def test_null_input(self) -> None:
        assert normalize_account_id(None) == DEFAULT_ACCOUNT_ID

    def test_empty_string(self) -> None:
        assert normalize_account_id("") == DEFAULT_ACCOUNT_ID

    def test_whitespace_only(self) -> None:
        assert normalize_account_id("   ") == DEFAULT_ACCOUNT_ID

    def test_lowercase(self) -> None:
        assert normalize_account_id("MyAccount") == "myaccount"

    def test_trim_whitespace(self) -> None:
        assert normalize_account_id("  account  ") == "account"

    def test_non_string(self) -> None:
        # noinspection PyTypeChecker
        assert normalize_account_id(123) == DEFAULT_ACCOUNT_ID  # type: ignore[arg-type]

    def test_default_keyword(self) -> None:
        assert normalize_account_id("default") == DEFAULT_ACCOUNT_ID
        assert normalize_account_id("DEFAULT") == DEFAULT_ACCOUNT_ID

    def test_default_with_whitespace(self) -> None:
        assert normalize_account_id("  default  ") == DEFAULT_ACCOUNT_ID

    def test_normal_id(self) -> None:
        assert normalize_account_id("business") == "business"

    def test_mixed_case_preserved(self) -> None:
        assert normalize_account_id("MyBusiness") == "mybusiness"


# ===================================================================
# getMultiAccountConfig
# ===================================================================


class TestGetMultiAccountConfig:
    """Tests for get_multi_account_config."""

    def test_empty_settings(self) -> None:
        rt = _rt()
        config = get_multi_account_config(rt)
        assert config.enabled is None
        assert config.access_token is None
        assert config.accounts is None

    def test_config_from_character(self) -> None:
        rt = _rt({
            "enabled": True,
            "accessToken": "test-token",
            "phoneNumberId": "123456789",
            "dmPolicy": "open",
            "accounts": {"business": {"phoneNumberId": "987654321"}},
        })
        config = get_multi_account_config(rt)
        assert config.enabled is True
        assert config.access_token == "test-token"
        assert config.phone_number_id == "123456789"
        assert config.dm_policy == "open"
        assert config.accounts is not None
        assert "business" in config.accounts

    def test_none_character(self) -> None:
        rt = MockRuntime(character=None)
        config = get_multi_account_config(rt)
        assert config.enabled is None

    def test_missing_settings_key(self) -> None:
        rt = MockRuntime(character={"no_settings": True})
        config = get_multi_account_config(rt)
        assert config.enabled is None


# ===================================================================
# listWhatsAppAccountIds
# ===================================================================


class TestListWhatsAppAccountIds:
    """Tests for list_whatsapp_account_ids."""

    def test_no_accounts(self) -> None:
        rt = _rt()
        ids = list_whatsapp_account_ids(rt)
        assert ids == [DEFAULT_ACCOUNT_ID]

    def test_base_config_credentials(self) -> None:
        rt = _rt({"accessToken": "test-token", "phoneNumberId": "123456789"})
        ids = list_whatsapp_account_ids(rt)
        assert DEFAULT_ACCOUNT_ID in ids

    def test_env_credentials(self) -> None:
        rt = _rt(
            settings_map={
                "WHATSAPP_ACCESS_TOKEN": "env-token",
                "WHATSAPP_PHONE_NUMBER_ID": "123456789",
            }
        )
        ids = list_whatsapp_account_ids(rt)
        assert DEFAULT_ACCOUNT_ID in ids

    def test_named_accounts(self) -> None:
        rt = _rt({
            "accounts": {
                "business1": {"phoneNumberId": "111"},
                "business2": {"phoneNumberId": "222"},
            },
        })
        ids = list_whatsapp_account_ids(rt)
        assert "business1" in ids
        assert "business2" in ids

    def test_sorted_account_ids(self) -> None:
        rt = _rt({"accounts": {"zebra": {}, "alpha": {}, "mango": {}}})
        ids = list_whatsapp_account_ids(rt)
        assert ids == ["alpha", "mango", "zebra"]

    def test_deduplication(self) -> None:
        rt = _rt({
            "accounts": {
                "Business": {"phoneNumberId": "111"},
                "business": {"phoneNumberId": "222"},
            }
        })
        ids = list_whatsapp_account_ids(rt)
        assert ids.count("business") == 1

    def test_empty_key_ignored(self) -> None:
        rt = _rt({"accounts": {"": {}, "valid": {}}})
        ids = list_whatsapp_account_ids(rt)
        assert "" not in ids
        assert "valid" in ids


# ===================================================================
# resolveDefaultWhatsAppAccountId
# ===================================================================


class TestResolveDefaultWhatsAppAccountId:
    """Tests for resolve_default_whatsapp_account_id."""

    def test_default_with_base_config(self) -> None:
        rt = _rt({"accessToken": "tok", "phoneNumberId": "phone"})
        assert resolve_default_whatsapp_account_id(rt) == DEFAULT_ACCOUNT_ID

    def test_first_named_when_no_default(self) -> None:
        rt = _rt({"accounts": {"alpha": {}, "beta": {}}})
        assert resolve_default_whatsapp_account_id(rt) == "alpha"


# ===================================================================
# resolveWhatsAppToken
# ===================================================================


class TestResolveWhatsAppToken:
    """Tests for resolve_whatsapp_token."""

    def test_account_config_first(self) -> None:
        rt = _rt({
            "accessToken": "base-token",
            "accounts": {"business": {"accessToken": "business-token"}},
        })
        result = resolve_whatsapp_token(rt, "business")
        assert result.token == "business-token"
        assert result.source == WhatsAppTokenSource.CONFIG

    def test_base_config_for_default(self) -> None:
        rt = _rt({"accessToken": "base-token"})
        result = resolve_whatsapp_token(rt, DEFAULT_ACCOUNT_ID)
        assert result.token == "base-token"
        assert result.source == WhatsAppTokenSource.CONFIG

    def test_env_fallback_for_default(self) -> None:
        rt = _rt(settings_map={"WHATSAPP_ACCESS_TOKEN": "env-token"})
        result = resolve_whatsapp_token(rt, DEFAULT_ACCOUNT_ID)
        assert result.token == "env-token"
        assert result.source == WhatsAppTokenSource.ENV

    def test_none_when_not_found(self) -> None:
        rt = _rt()
        result = resolve_whatsapp_token(rt, "nonexistent")
        assert result.token == ""
        assert result.source == WhatsAppTokenSource.NONE

    def test_token_trimmed(self) -> None:
        rt = _rt({"accessToken": "  token-with-spaces  "})
        result = resolve_whatsapp_token(rt, DEFAULT_ACCOUNT_ID)
        assert result.token == "token-with-spaces"

    def test_env_not_used_for_named_account(self) -> None:
        rt = _rt(settings_map={"WHATSAPP_ACCESS_TOKEN": "env-token"})
        result = resolve_whatsapp_token(rt, "business")
        assert result.token == ""
        assert result.source == WhatsAppTokenSource.NONE

    def test_whitespace_only_token_ignored(self) -> None:
        rt = _rt({"accessToken": "   "})
        result = resolve_whatsapp_token(rt, DEFAULT_ACCOUNT_ID)
        # Falls through to env, which is also empty
        assert result.token == ""
        assert result.source == WhatsAppTokenSource.NONE


# ===================================================================
# resolveWhatsAppAccount
# ===================================================================


class TestResolveWhatsAppAccount:
    """Tests for resolve_whatsapp_account."""

    def test_merged_config(self) -> None:
        rt = _rt({
            "enabled": True,
            "dmPolicy": "allowlist",
            "accounts": {
                "business": {
                    "name": "My Business",
                    "accessToken": "business-token",
                    "phoneNumberId": "123456789",
                    "dmPolicy": "open",
                },
            },
        })
        account = resolve_whatsapp_account(rt, "business")
        assert account.account_id == "business"
        assert account.enabled is True
        assert account.name == "My Business"
        assert account.access_token == "business-token"
        assert account.phone_number_id == "123456789"
        assert account.configured is True
        assert account.config.dm_policy == "open"

    def test_normalize_account_id_in_resolve(self) -> None:
        rt = _rt()
        account = resolve_whatsapp_account(rt, "  MyBusiness  ")
        assert account.account_id == "mybusiness"

    def test_null_account_id(self) -> None:
        rt = _rt()
        account = resolve_whatsapp_account(rt, None)
        assert account.account_id == DEFAULT_ACCOUNT_ID

    def test_disabled_when_base_disabled(self) -> None:
        rt = _rt({
            "enabled": False,
            "accounts": {"business": {"enabled": True}},
        })
        account = resolve_whatsapp_account(rt, "business")
        assert account.enabled is False

    def test_not_configured_missing_credentials(self) -> None:
        rt = _rt({"accounts": {"business": {"name": "No Token"}}})
        account = resolve_whatsapp_account(rt, "business")
        assert account.configured is False

    def test_requires_both_token_and_phone(self) -> None:
        rt = _rt({
            "accounts": {
                "tokenOnly": {"accessToken": "token"},
                "phoneOnly": {"phoneNumberId": "123"},
                "both": {"accessToken": "token", "phoneNumberId": "123"},
            },
        })
        assert resolve_whatsapp_account(rt, "tokenOnly").configured is False
        assert resolve_whatsapp_account(rt, "phoneOnly").configured is False
        assert resolve_whatsapp_account(rt, "both").configured is True

    def test_merge_env_settings(self) -> None:
        rt = _rt(
            settings_map={
                "WHATSAPP_ACCESS_TOKEN": "env-token",
                "WHATSAPP_PHONE_NUMBER_ID": "env-phone",
                "WHATSAPP_BUSINESS_ACCOUNT_ID": "env-business",
            }
        )
        account = resolve_whatsapp_account(rt, None)
        assert account.access_token == "env-token"
        assert account.phone_number_id == "env-phone"
        assert account.business_account_id == "env-business"

    def test_account_disabled_itself(self) -> None:
        rt = _rt({
            "enabled": True,
            "accounts": {"business": {"enabled": False, "accessToken": "t", "phoneNumberId": "p"}},
        })
        account = resolve_whatsapp_account(rt, "business")
        assert account.enabled is False

    def test_token_source_reflected(self) -> None:
        rt = _rt({"accessToken": "config-token", "phoneNumberId": "phone"})
        account = resolve_whatsapp_account(rt, DEFAULT_ACCOUNT_ID)
        assert account.token_source == WhatsAppTokenSource.CONFIG


# ===================================================================
# listEnabledWhatsAppAccounts
# ===================================================================


class TestListEnabledWhatsAppAccounts:
    """Tests for list_enabled_whatsapp_accounts."""

    def test_only_enabled_and_configured(self) -> None:
        rt = _rt({
            "accounts": {
                "enabled1": {"enabled": True, "accessToken": "token1", "phoneNumberId": "phone1"},
                "disabled": {"enabled": False, "accessToken": "token2", "phoneNumberId": "phone2"},
                "unconfigured": {"enabled": True},
            },
        })
        accounts = list_enabled_whatsapp_accounts(rt)
        assert len(accounts) == 1
        assert accounts[0].account_id == "enabled1"

    def test_empty_when_none_configured(self) -> None:
        rt = _rt({"accounts": {"a": {}, "b": {}}})
        accounts = list_enabled_whatsapp_accounts(rt)
        assert len(accounts) == 0

    def test_default_account_included(self) -> None:
        rt = _rt({"accessToken": "tok", "phoneNumberId": "phone"})
        accounts = list_enabled_whatsapp_accounts(rt)
        assert any(a.account_id == DEFAULT_ACCOUNT_ID for a in accounts)


# ===================================================================
# isMultiAccountEnabled
# ===================================================================


class TestIsMultiAccountEnabled:
    """Tests for is_multi_account_enabled."""

    def test_single_account(self) -> None:
        rt = _rt({"accessToken": "single-token", "phoneNumberId": "single-phone"})
        assert is_multi_account_enabled(rt) is False

    def test_multiple_accounts(self) -> None:
        rt = _rt({
            "accessToken": "default-token",
            "phoneNumberId": "default-phone",
            "accounts": {
                "business": {"accessToken": "business-token", "phoneNumberId": "business-phone"},
            },
        })
        assert is_multi_account_enabled(rt) is True

    def test_multiple_but_only_one_configured(self) -> None:
        rt = _rt({
            "accessToken": "default-token",
            "phoneNumberId": "default-phone",
            "accounts": {"business": {}},
        })
        assert is_multi_account_enabled(rt) is False


# ===================================================================
# isWhatsAppUserAllowed
# ===================================================================


class TestIsWhatsAppUserAllowed:
    """Tests for is_whatsapp_user_allowed."""

    def test_open_policy_allows_all(self) -> None:
        assert is_whatsapp_user_allowed(
            identifier="+1234567890",
            account_config=WhatsAppAccountRuntimeConfig(dmPolicy="open"),
            is_group=False,
        ) is True

    def test_disabled_policy_denies_all(self) -> None:
        assert is_whatsapp_user_allowed(
            identifier="+1234567890",
            account_config=WhatsAppAccountRuntimeConfig(dmPolicy="disabled"),
            is_group=False,
        ) is False

    def test_allowlist_in_list(self) -> None:
        assert is_whatsapp_user_allowed(
            identifier="+1234567890",
            account_config=WhatsAppAccountRuntimeConfig(
                dmPolicy="allowlist", allowFrom=["+1234567890", "+0987654321"]
            ),
            is_group=False,
        ) is True

    def test_allowlist_not_in_list(self) -> None:
        assert is_whatsapp_user_allowed(
            identifier="+1111111111",
            account_config=WhatsAppAccountRuntimeConfig(
                dmPolicy="allowlist", allowFrom=["+1234567890", "+0987654321"]
            ),
            is_group=False,
        ) is False

    def test_pairing_default_for_dms(self) -> None:
        assert is_whatsapp_user_allowed(
            identifier="+1234567890",
            account_config=WhatsAppAccountRuntimeConfig(),
            is_group=False,
        ) is True

    def test_group_allowlist_allowed(self) -> None:
        assert is_whatsapp_user_allowed(
            identifier="+1234567890",
            account_config=WhatsAppAccountRuntimeConfig(
                groupPolicy="allowlist", groupAllowFrom=["+1234567890"]
            ),
            is_group=True,
        ) is True

    def test_group_allowlist_denied(self) -> None:
        assert is_whatsapp_user_allowed(
            identifier="+1234567890",
            account_config=WhatsAppAccountRuntimeConfig(
                groupPolicy="allowlist", groupAllowFrom=["+9999999999"]
            ),
            is_group=True,
        ) is False

    def test_group_open_policy(self) -> None:
        assert is_whatsapp_user_allowed(
            identifier="+1234567890",
            account_config=WhatsAppAccountRuntimeConfig(groupPolicy="open"),
            is_group=True,
        ) is True

    def test_group_disabled_policy(self) -> None:
        assert is_whatsapp_user_allowed(
            identifier="+1234567890",
            account_config=WhatsAppAccountRuntimeConfig(groupPolicy="disabled"),
            is_group=True,
        ) is False

    def test_group_specific_allowlist(self) -> None:
        group_config = WhatsAppGroupRuntimeConfig(allowFrom=["+1234567890"])
        assert is_whatsapp_user_allowed(
            identifier="+1234567890",
            account_config=WhatsAppAccountRuntimeConfig(groupPolicy="allowlist"),
            is_group=True,
            group_config=group_config,
        ) is True

    def test_group_specific_allowlist_denied(self) -> None:
        group_config = WhatsAppGroupRuntimeConfig(allowFrom=["+9999999999"])
        assert is_whatsapp_user_allowed(
            identifier="+1234567890",
            account_config=WhatsAppAccountRuntimeConfig(groupPolicy="allowlist"),
            is_group=True,
            group_config=group_config,
        ) is False

    def test_allowlist_empty_denies(self) -> None:
        assert is_whatsapp_user_allowed(
            identifier="+1234567890",
            account_config=WhatsAppAccountRuntimeConfig(dmPolicy="allowlist"),
            is_group=False,
        ) is False

    def test_numeric_allowlist_entries(self) -> None:
        assert is_whatsapp_user_allowed(
            identifier="1234567890",
            account_config=WhatsAppAccountRuntimeConfig(
                dmPolicy="allowlist", allowFrom=[1234567890]
            ),
            is_group=False,
        ) is True

    def test_group_default_policy_is_allowlist(self) -> None:
        # Default group policy is "allowlist" with no entries → denied
        assert is_whatsapp_user_allowed(
            identifier="+1234567890",
            account_config=WhatsAppAccountRuntimeConfig(),
            is_group=True,
        ) is False


# ===================================================================
# isWhatsAppGroupAllowed
# ===================================================================


class TestIsWhatsAppGroupAllowed:
    """Tests for is_whatsapp_group_allowed."""

    def test_open_policy(self) -> None:
        assert is_whatsapp_group_allowed(
            group_id="group@g.us",
            account_config=WhatsAppAccountRuntimeConfig(groupPolicy="open"),
        ) is True

    def test_disabled_policy(self) -> None:
        assert is_whatsapp_group_allowed(
            group_id="group@g.us",
            account_config=WhatsAppAccountRuntimeConfig(groupPolicy="disabled"),
        ) is False

    def test_group_config_enabled(self) -> None:
        assert is_whatsapp_group_allowed(
            group_id="group@g.us",
            account_config=WhatsAppAccountRuntimeConfig(groupPolicy="allowlist"),
            group_config=WhatsAppGroupRuntimeConfig(enabled=True),
        ) is True

    def test_group_config_disabled(self) -> None:
        assert is_whatsapp_group_allowed(
            group_id="group@g.us",
            account_config=WhatsAppAccountRuntimeConfig(groupPolicy="allowlist"),
            group_config=WhatsAppGroupRuntimeConfig(enabled=False),
        ) is False

    def test_in_group_allowlist(self) -> None:
        assert is_whatsapp_group_allowed(
            group_id="group@g.us",
            account_config=WhatsAppAccountRuntimeConfig(
                groupPolicy="allowlist", groupAllowFrom=["group@g.us"]
            ),
        ) is True

    def test_not_in_group_allowlist(self) -> None:
        assert is_whatsapp_group_allowed(
            group_id="group@g.us",
            account_config=WhatsAppAccountRuntimeConfig(
                groupPolicy="allowlist", groupAllowFrom=["other@g.us"]
            ),
        ) is False


# ===================================================================
# isWhatsAppMentionRequired
# ===================================================================


class TestIsWhatsAppMentionRequired:
    """Tests for is_whatsapp_mention_required."""

    def test_false_by_default(self) -> None:
        assert is_whatsapp_mention_required(
            account_config=WhatsAppAccountRuntimeConfig()
        ) is False

    def test_true_from_group_config(self) -> None:
        assert is_whatsapp_mention_required(
            account_config=WhatsAppAccountRuntimeConfig(),
            group_config=WhatsAppGroupRuntimeConfig(requireMention=True),
        ) is True

    def test_false_from_group_config(self) -> None:
        assert is_whatsapp_mention_required(
            account_config=WhatsAppAccountRuntimeConfig(),
            group_config=WhatsAppGroupRuntimeConfig(requireMention=False),
        ) is False


# ===================================================================
# resolveWhatsAppGroupConfig
# ===================================================================


class TestResolveWhatsAppGroupConfig:
    """Tests for resolve_whatsapp_group_config."""

    def test_account_level_group(self) -> None:
        rt = _rt({
            "accounts": {
                "business": {
                    "groups": {
                        "group1@g.us": {"requireMention": True},
                    },
                },
            },
        })
        config = resolve_whatsapp_group_config(rt, "business", "group1@g.us")
        assert config is not None
        assert config.require_mention is True

    def test_base_level_fallback(self) -> None:
        rt = _rt({
            "groups": {
                "group1@g.us": {"requireMention": True},
            },
        })
        config = resolve_whatsapp_group_config(rt, "business", "group1@g.us")
        assert config is not None
        assert config.require_mention is True

    def test_unknown_group(self) -> None:
        rt = _rt()
        config = resolve_whatsapp_group_config(rt, "business", "unknown@g.us")
        assert config is None

    def test_account_level_overrides_base(self) -> None:
        rt = _rt({
            "groups": {
                "group1@g.us": {"requireMention": False},
            },
            "accounts": {
                "business": {
                    "groups": {
                        "group1@g.us": {"requireMention": True},
                    },
                },
            },
        })
        config = resolve_whatsapp_group_config(rt, "business", "group1@g.us")
        assert config is not None
        assert config.require_mention is True

    def test_base_used_when_no_account_group(self) -> None:
        rt = _rt({
            "groups": {
                "group1@g.us": {"requireMention": True},
            },
            "accounts": {
                "business": {
                    "groups": {
                        "other@g.us": {"requireMention": False},
                    },
                },
            },
        })
        config = resolve_whatsapp_group_config(rt, "business", "group1@g.us")
        assert config is not None
        assert config.require_mention is True

    def test_group_skills(self) -> None:
        rt = _rt({
            "groups": {
                "group1@g.us": {"skills": ["translate", "summarize"]},
            },
        })
        config = resolve_whatsapp_group_config(rt, "default", "group1@g.us")
        assert config is not None
        assert config.skills == ["translate", "summarize"]

    def test_group_system_prompt(self) -> None:
        rt = _rt({
            "groups": {
                "group1@g.us": {"systemPrompt": "You are a helpful assistant."},
            },
        })
        config = resolve_whatsapp_group_config(rt, "default", "group1@g.us")
        assert config is not None
        assert config.system_prompt == "You are a helpful assistant."
