"""WhatsApp multi-account management.

Provides configuration resolution, token lookup, allowlist management,
and multi-account orchestration for the WhatsApp Cloud API plugin.
"""

from __future__ import annotations

from enum import Enum
from typing import Literal, Protocol, runtime_checkable

from pydantic import BaseModel, ConfigDict, Field


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

DEFAULT_ACCOUNT_ID: str = "default"
"""Identifier used when no specific account is configured."""


# ---------------------------------------------------------------------------
# Token source
# ---------------------------------------------------------------------------


class WhatsAppTokenSource(str, Enum):
    """Indicates where a resolved token was found."""

    CONFIG = "config"
    ENV = "env"
    CHARACTER = "character"
    NONE = "none"


# ---------------------------------------------------------------------------
# Configuration models
# ---------------------------------------------------------------------------


class WhatsAppGroupRuntimeConfig(BaseModel):
    """Runtime configuration for a single WhatsApp group."""

    model_config = ConfigDict(populate_by_name=True)

    enabled: bool | None = None
    """If ``False``, ignore messages from this group."""

    allow_from: list[str | int] | None = Field(default=None, alias="allowFrom")
    """Allowlist for users in this group."""

    require_mention: bool | None = Field(default=None, alias="requireMention")
    """Require bot mention to respond."""

    system_prompt: str | None = Field(default=None, alias="systemPrompt")
    """Custom system prompt for this group."""

    skills: list[str] | None = None
    """Skills enabled for this group."""


class WhatsAppAccountRuntimeConfig(BaseModel):
    """Configuration for a single WhatsApp account (runtime resolution)."""

    model_config = ConfigDict(populate_by_name=True)

    name: str | None = None
    """Optional display name."""

    enabled: bool | None = None
    """If ``False``, do not start this account."""

    access_token: str | None = Field(default=None, alias="accessToken")
    """WhatsApp Cloud API access token."""

    phone_number_id: str | None = Field(default=None, alias="phoneNumberId")
    """Phone number ID from WhatsApp Business."""

    business_account_id: str | None = Field(default=None, alias="businessAccountId")
    """Business account ID."""

    webhook_verify_token: str | None = Field(default=None, alias="webhookVerifyToken")
    """Webhook verification token."""

    api_version: str | None = Field(default=None, alias="apiVersion")
    """API version to use."""

    allow_from: list[str | int] | None = Field(default=None, alias="allowFrom")
    """Allowlist for DM senders."""

    group_allow_from: list[str | int] | None = Field(default=None, alias="groupAllowFrom")
    """Allowlist for groups."""

    dm_policy: Literal["open", "allowlist", "pairing", "disabled"] | None = Field(
        default=None, alias="dmPolicy"
    )
    """DM access policy."""

    group_policy: Literal["open", "allowlist", "disabled"] | None = Field(
        default=None, alias="groupPolicy"
    )
    """Group message access policy."""

    media_max_mb: int | None = Field(default=None, alias="mediaMaxMb")
    """Max media size in MB."""

    text_chunk_limit: int | None = Field(default=None, alias="textChunkLimit")
    """Text chunk limit for messages."""

    groups: dict[str, WhatsAppGroupRuntimeConfig] | None = None
    """Group-specific configurations."""


class WhatsAppMultiAccountConfig(BaseModel):
    """Top-level multi-account WhatsApp configuration."""

    model_config = ConfigDict(populate_by_name=True)

    enabled: bool | None = None
    access_token: str | None = Field(default=None, alias="accessToken")
    phone_number_id: str | None = Field(default=None, alias="phoneNumberId")
    business_account_id: str | None = Field(default=None, alias="businessAccountId")
    webhook_verify_token: str | None = Field(default=None, alias="webhookVerifyToken")
    api_version: str | None = Field(default=None, alias="apiVersion")
    dm_policy: Literal["open", "allowlist", "pairing", "disabled"] | None = Field(
        default=None, alias="dmPolicy"
    )
    group_policy: Literal["open", "allowlist", "disabled"] | None = Field(
        default=None, alias="groupPolicy"
    )
    media_max_mb: int | None = Field(default=None, alias="mediaMaxMb")
    text_chunk_limit: int | None = Field(default=None, alias="textChunkLimit")
    accounts: dict[str, WhatsAppAccountRuntimeConfig] | None = None
    groups: dict[str, WhatsAppGroupRuntimeConfig] | None = None


# ---------------------------------------------------------------------------
# Token resolution result
# ---------------------------------------------------------------------------


class WhatsAppTokenResolution(BaseModel):
    """Result of token resolution."""

    token: str
    source: WhatsAppTokenSource


# ---------------------------------------------------------------------------
# Resolved account
# ---------------------------------------------------------------------------


class ResolvedWhatsAppAccount(BaseModel):
    """A fully resolved WhatsApp account ready for use."""

    model_config = ConfigDict(populate_by_name=True)

    account_id: str = Field(alias="accountId")
    enabled: bool
    name: str | None = None
    access_token: str = Field(alias="accessToken")
    phone_number_id: str = Field(alias="phoneNumberId")
    business_account_id: str | None = Field(default=None, alias="businessAccountId")
    token_source: WhatsAppTokenSource = Field(alias="tokenSource")
    configured: bool
    config: WhatsAppAccountRuntimeConfig


# ---------------------------------------------------------------------------
# Access check result
# ---------------------------------------------------------------------------


class WhatsAppAccessCheckResult(BaseModel):
    """Result of an async WhatsApp access check."""

    model_config = ConfigDict(populate_by_name=True)

    allowed: bool
    pairing_code: str | None = Field(default=None, alias="pairingCode")
    new_pairing_request: bool | None = Field(default=None, alias="newPairingRequest")
    reply_message: str | None = Field(default=None, alias="replyMessage")


# ---------------------------------------------------------------------------
# Runtime protocol (duck-typed for testability)
# ---------------------------------------------------------------------------


@runtime_checkable
class AgentRuntime(Protocol):
    """Minimal protocol expected from an ElizaOS agent runtime."""

    @property
    def character(self) -> object: ...

    def get_setting(self, key: str) -> str | None: ...


# ---------------------------------------------------------------------------
# Account ID helpers
# ---------------------------------------------------------------------------


def normalize_account_id(account_id: str | None = None) -> str:
    """Normalize an account ID.

    Returns :data:`DEFAULT_ACCOUNT_ID` for ``None``, empty, whitespace-only,
    non-string, or ``"default"`` inputs.  Otherwise returns the trimmed
    lower-cased value.
    """
    if not account_id:
        return DEFAULT_ACCOUNT_ID
    trimmed = account_id.strip().lower()
    if not trimmed or trimmed == "default":
        return DEFAULT_ACCOUNT_ID
    return trimmed


# ---------------------------------------------------------------------------
# Multi-account config extraction
# ---------------------------------------------------------------------------


def _get_character_whatsapp(runtime: AgentRuntime) -> dict[str, object] | None:
    """Safely extract ``character.settings.whatsapp`` from the runtime."""
    character = getattr(runtime, "character", None)
    if character is None:
        return None
    settings: dict[str, object] | None = None
    if isinstance(character, dict):
        settings = character.get("settings")
    else:
        settings = getattr(character, "settings", None)
        if settings and not isinstance(settings, dict):
            settings = getattr(settings, "__dict__", None)
    if not settings or not isinstance(settings, dict):
        return None
    wa = settings.get("whatsapp")
    return wa if isinstance(wa, dict) else None


def get_multi_account_config(runtime: AgentRuntime) -> WhatsAppMultiAccountConfig:
    """Extract the multi-account configuration from *runtime*."""
    wa = _get_character_whatsapp(runtime)
    if not wa:
        return WhatsAppMultiAccountConfig()
    return WhatsAppMultiAccountConfig(
        enabled=wa.get("enabled"),
        accessToken=wa.get("accessToken"),
        phoneNumberId=wa.get("phoneNumberId"),
        businessAccountId=wa.get("businessAccountId"),
        webhookVerifyToken=wa.get("webhookVerifyToken"),
        apiVersion=wa.get("apiVersion"),
        dmPolicy=wa.get("dmPolicy"),
        groupPolicy=wa.get("groupPolicy"),
        mediaMaxMb=wa.get("mediaMaxMb"),
        textChunkLimit=wa.get("textChunkLimit"),
        accounts=wa.get("accounts"),
        groups=wa.get("groups"),
    )


# ---------------------------------------------------------------------------
# Account listing
# ---------------------------------------------------------------------------


def list_whatsapp_account_ids(runtime: AgentRuntime) -> list[str]:
    """List all configured account IDs (sorted)."""
    config = get_multi_account_config(runtime)
    accounts = config.accounts
    ids: set[str] = set()

    env_token = runtime.get_setting("WHATSAPP_ACCESS_TOKEN")
    env_phone = runtime.get_setting("WHATSAPP_PHONE_NUMBER_ID")

    base_configured = bool(
        config.access_token and config.access_token.strip()
        and config.phone_number_id and config.phone_number_id.strip()
    )
    env_configured = bool(
        env_token and env_token.strip()
        and env_phone and env_phone.strip()
    )

    if base_configured or env_configured:
        ids.add(DEFAULT_ACCOUNT_ID)

    if accounts and isinstance(accounts, dict):
        for id_ in accounts:
            if id_:
                ids.add(normalize_account_id(id_))

    result = sorted(ids)
    if not result:
        return [DEFAULT_ACCOUNT_ID]
    return result


def resolve_default_whatsapp_account_id(runtime: AgentRuntime) -> str:
    """Resolve the default account ID to use."""
    ids = list_whatsapp_account_ids(runtime)
    if DEFAULT_ACCOUNT_ID in ids:
        return DEFAULT_ACCOUNT_ID
    return ids[0] if ids else DEFAULT_ACCOUNT_ID


# ---------------------------------------------------------------------------
# Account-specific config lookup
# ---------------------------------------------------------------------------


def _get_account_config(
    runtime: AgentRuntime, account_id: str
) -> WhatsAppAccountRuntimeConfig | None:
    """Get the account-specific runtime configuration."""
    config = get_multi_account_config(runtime)
    accounts = config.accounts

    if not accounts or not isinstance(accounts, dict):
        return None

    # Direct match
    direct = accounts.get(account_id)
    if direct:
        if isinstance(direct, dict):
            return WhatsAppAccountRuntimeConfig(**direct)
        return direct

    # Normalized match
    normalized = normalize_account_id(account_id)
    for key, val in accounts.items():
        if normalize_account_id(key) == normalized:
            if isinstance(val, dict):
                return WhatsAppAccountRuntimeConfig(**val)
            return val

    return None


# ---------------------------------------------------------------------------
# Token resolution
# ---------------------------------------------------------------------------


def resolve_whatsapp_token(
    runtime: AgentRuntime, account_id: str
) -> WhatsAppTokenResolution:
    """Resolve the access token for a WhatsApp account.

    Resolution order:
    1. Account-level ``accessToken``
    2. Base-level ``accessToken`` (default account only)
    3. Environment / runtime setting ``WHATSAPP_ACCESS_TOKEN`` (default only)
    4. ``none``
    """
    multi_config = get_multi_account_config(runtime)
    account_config = _get_account_config(runtime, account_id)

    # Account-level
    if account_config and account_config.access_token and account_config.access_token.strip():
        return WhatsAppTokenResolution(
            token=account_config.access_token.strip(),
            source=WhatsAppTokenSource.CONFIG,
        )

    # Default account fallbacks
    if account_id == DEFAULT_ACCOUNT_ID:
        if multi_config.access_token and multi_config.access_token.strip():
            return WhatsAppTokenResolution(
                token=multi_config.access_token.strip(),
                source=WhatsAppTokenSource.CONFIG,
            )
        env_token = runtime.get_setting("WHATSAPP_ACCESS_TOKEN")
        if env_token and env_token.strip():
            return WhatsAppTokenResolution(
                token=env_token.strip(),
                source=WhatsAppTokenSource.ENV,
            )

    return WhatsAppTokenResolution(token="", source=WhatsAppTokenSource.NONE)


# ---------------------------------------------------------------------------
# Config merging
# ---------------------------------------------------------------------------


def _filter_defined(d: dict[str, object]) -> dict[str, object]:
    """Remove keys with ``None`` values to prevent overwrites during merge."""
    return {k: v for k, v in d.items() if v is not None}


def _merge_whatsapp_account_config(
    runtime: AgentRuntime, account_id: str
) -> WhatsAppAccountRuntimeConfig:
    """Merge environment, base, and account-specific configuration."""
    multi_config = get_multi_account_config(runtime)
    account_config = _get_account_config(runtime, account_id)
    account_dict = (
        account_config.model_dump(by_alias=True) if account_config else {}
    )

    # Base config (everything except ``accounts``)
    base_dict = multi_config.model_dump(by_alias=True, exclude={"accounts"})

    # Environment settings
    env_token = runtime.get_setting("WHATSAPP_ACCESS_TOKEN")
    env_phone = runtime.get_setting("WHATSAPP_PHONE_NUMBER_ID")
    env_business = runtime.get_setting("WHATSAPP_BUSINESS_ACCOUNT_ID")
    env_webhook = runtime.get_setting("WHATSAPP_WEBHOOK_VERIFY_TOKEN")
    env_dm_policy = runtime.get_setting("WHATSAPP_DM_POLICY")
    env_group_policy = runtime.get_setting("WHATSAPP_GROUP_POLICY")

    env_dict: dict[str, object] = {
        "accessToken": env_token or None,
        "phoneNumberId": env_phone or None,
        "businessAccountId": env_business or None,
        "webhookVerifyToken": env_webhook or None,
        "dmPolicy": env_dm_policy or None,
        "groupPolicy": env_group_policy or None,
    }

    # Merge order: env < base < account
    merged = {
        **_filter_defined(env_dict),
        **_filter_defined(base_dict),
        **_filter_defined(account_dict),
    }

    return WhatsAppAccountRuntimeConfig(**merged)


# ---------------------------------------------------------------------------
# Full account resolution
# ---------------------------------------------------------------------------


def resolve_whatsapp_account(
    runtime: AgentRuntime, account_id: str | None = None
) -> ResolvedWhatsAppAccount:
    """Resolve a complete WhatsApp account configuration."""
    normalized_id = normalize_account_id(account_id)
    multi_config = get_multi_account_config(runtime)

    base_enabled = multi_config.enabled is not False
    merged = _merge_whatsapp_account_config(runtime, normalized_id)
    account_enabled = merged.enabled is not False
    enabled = base_enabled and account_enabled

    resolution = resolve_whatsapp_token(runtime, normalized_id)
    phone_number_id = (merged.phone_number_id or "").strip()

    configured = bool(resolution.token and phone_number_id)

    return ResolvedWhatsAppAccount(
        accountId=normalized_id,
        enabled=enabled,
        name=(merged.name.strip() if merged.name else None) or None,
        accessToken=resolution.token,
        phoneNumberId=phone_number_id,
        businessAccountId=(
            (merged.business_account_id.strip() if merged.business_account_id else None) or None
        ),
        tokenSource=resolution.source,
        configured=configured,
        config=merged,
    )


# ---------------------------------------------------------------------------
# Listing enabled accounts
# ---------------------------------------------------------------------------


def list_enabled_whatsapp_accounts(runtime: AgentRuntime) -> list[ResolvedWhatsAppAccount]:
    """Return all enabled **and** configured WhatsApp accounts."""
    return [
        acct
        for acct in (
            resolve_whatsapp_account(runtime, aid)
            for aid in list_whatsapp_account_ids(runtime)
        )
        if acct.enabled and acct.configured
    ]


def is_multi_account_enabled(runtime: AgentRuntime) -> bool:
    """Return ``True`` when more than one account is enabled and configured."""
    return len(list_enabled_whatsapp_accounts(runtime)) > 1


# ---------------------------------------------------------------------------
# Group config resolution
# ---------------------------------------------------------------------------


def resolve_whatsapp_group_config(
    runtime: AgentRuntime,
    account_id: str,
    group_id: str,
) -> WhatsAppGroupRuntimeConfig | None:
    """Resolve the configuration for a specific group.

    Checks account-level groups first, then falls back to base-level groups.
    """
    multi_config = get_multi_account_config(runtime)
    account_config = _get_account_config(runtime, account_id)

    # Account-level groups
    if account_config and account_config.groups:
        group = account_config.groups.get(group_id)
        if group:
            if isinstance(group, dict):
                return WhatsAppGroupRuntimeConfig(**group)
            return group

    # Base-level groups
    if multi_config.groups:
        group = multi_config.groups.get(group_id)
        if group:
            if isinstance(group, dict):
                return WhatsAppGroupRuntimeConfig(**group)
            return group

    return None


# ---------------------------------------------------------------------------
# Allowlist management
# ---------------------------------------------------------------------------


def is_whatsapp_user_allowed(
    *,
    identifier: str,
    account_config: WhatsAppAccountRuntimeConfig,
    is_group: bool,
    group_id: str | None = None,
    group_config: WhatsAppGroupRuntimeConfig | None = None,
) -> bool:
    """Check if a user is allowed based on policy and allowlists.

    For group messages, checks ``groupPolicy`` and group/account allowlists.
    For DMs, checks ``dmPolicy`` and the DM allowlist.
    """
    if is_group:
        policy = account_config.group_policy or "allowlist"
        if policy == "disabled":
            return False
        if policy == "open":
            return True

        # Group-specific allowlist
        if group_config and group_config.allow_from:
            return any(str(a) == identifier for a in group_config.allow_from)

        # Account-level group allowlist
        if account_config.group_allow_from:
            return any(str(a) == identifier for a in account_config.group_allow_from)

        return policy != "allowlist"

    # DM handling
    policy = account_config.dm_policy or "pairing"
    if policy == "disabled":
        return False
    if policy == "open":
        return True
    if policy == "pairing":
        return True

    # Allowlist policy
    if account_config.allow_from:
        return any(str(a) == identifier for a in account_config.allow_from)

    return False


def is_whatsapp_group_allowed(
    *,
    group_id: str,
    account_config: WhatsAppAccountRuntimeConfig,
    group_config: WhatsAppGroupRuntimeConfig | None = None,
) -> bool:
    """Check if a group is allowed based on policy and group allowlists."""
    policy = account_config.group_policy or "allowlist"
    if policy == "disabled":
        return False
    if policy == "open":
        return True

    # Group-specific config takes precedence
    if group_config is not None:
        return group_config.enabled is not False

    # Check account-level group allowlist
    if account_config.group_allow_from:
        return any(str(a) == group_id for a in account_config.group_allow_from)

    return policy != "allowlist"


def is_whatsapp_mention_required(
    *,
    account_config: WhatsAppAccountRuntimeConfig,
    group_config: WhatsAppGroupRuntimeConfig | None = None,
) -> bool:
    """Check if bot mention is required to respond in a group."""
    if group_config:
        return group_config.require_mention or False
    return False
