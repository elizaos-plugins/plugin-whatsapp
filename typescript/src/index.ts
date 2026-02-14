import { EventEmitter } from "node:events";
import type { Plugin } from "@elizaos/core";
import { sendMessageAction, sendReactionAction } from "./actions";
import { ClientFactory } from "./clients/factory";
import type { IWhatsAppClient } from "./clients/interface";
import { MessageHandler, WebhookHandler } from "./handlers";
import type {
  ConnectionStatus,
  WhatsAppConfig,
  WhatsAppMessage,
  WhatsAppMessageResponse,
  WhatsAppWebhookEvent,
} from "./types";

export class WhatsAppPlugin extends EventEmitter implements Plugin {
  private readonly client: IWhatsAppClient;
  private readonly messageHandler: MessageHandler;
  private readonly webhookHandler: WebhookHandler;

  name: string;
  description: string;
  actions = [sendMessageAction, sendReactionAction];

  constructor(config: WhatsAppConfig) {
    super();
    this.name = "WhatsApp Plugin";
    this.description = "WhatsApp integration supporting Cloud API and Baileys (QR auth)";
    this.client = ClientFactory.create(config);
    this.messageHandler = new MessageHandler(this.client);
    this.webhookHandler = new WebhookHandler();
    this.setupEventForwarding();
  }

  private setupEventForwarding(): void {
    this.client.on("message", (payload) => this.emit("message", payload));
    this.client.on("qr", (payload) => this.emit("qr", payload));
    this.client.on("ready", () => this.emit("ready"));
    this.client.on("connection", (status) => this.emit("connection", status));
    this.client.on("error", (error) => this.emit("error", error));
  }

  async start(): Promise<void> {
    await this.client.start();
  }

  async stop(): Promise<void> {
    await this.client.stop();
  }

  getConnectionStatus(): ConnectionStatus {
    return this.client.getConnectionStatus();
  }

  async sendMessage(message: WhatsAppMessage): Promise<WhatsAppMessageResponse> {
    return this.messageHandler.send(message);
  }

  async handleWebhook(event: WhatsAppWebhookEvent): Promise<void> {
    return this.webhookHandler.handle(event);
  }

  async verifyWebhook(token: string): Promise<boolean> {
    if (!this.client.verifyWebhook) {
      throw new Error("verifyWebhook is only supported by Cloud API authentication");
    }
    return this.client.verifyWebhook(token);
  }
}

const whatsappPlugin: Plugin = {
  name: "whatsapp",
  description: "WhatsApp integration for ElizaOS (Cloud API + Baileys)",
  actions: [sendMessageAction, sendReactionAction],
};

export default whatsappPlugin;

// Account management exports
export {
  checkWhatsAppUserAccess,
  DEFAULT_ACCOUNT_ID,
  isMultiAccountEnabled,
  isWhatsAppMentionRequired,
  isWhatsAppUserAllowed,
  listEnabledWhatsAppAccounts,
  listWhatsAppAccountIds,
  normalizeAccountId,
  type ResolvedWhatsAppAccount,
  resolveDefaultWhatsAppAccountId,
  resolveWhatsAppAccount,
  resolveWhatsAppGroupConfig,
  resolveWhatsAppToken,
  type WhatsAppAccessCheckResult,
  type WhatsAppAccountRuntimeConfig,
  type WhatsAppGroupRuntimeConfig,
  type WhatsAppMultiAccountConfig,
  type WhatsAppTokenResolution,
  type WhatsAppTokenSource,
} from "./accounts";

// Channel configuration types
export type {
  WhatsAppAccountConfig,
  WhatsAppAckReactionConfig,
  WhatsAppActionConfig,
  WhatsAppChannelConfig,
  WhatsAppGroupConfig,
} from "./config";

// Normalization and utility exports
export {
  buildWhatsAppUserJid,
  type ChunkWhatsAppTextOpts,
  chunkWhatsAppText,
  formatWhatsAppId,
  formatWhatsAppPhoneNumber,
  getWhatsAppChatType,
  isValidWhatsAppNumber,
  isWhatsAppGroup,
  isWhatsAppGroupJid,
  isWhatsAppUserTarget,
  normalizeE164,
  normalizeWhatsAppTarget,
  resolveWhatsAppSystemLocation,
  truncateText,
  WHATSAPP_TEXT_CHUNK_LIMIT,
} from "./normalize";

export { ClientFactory } from "./clients/factory";
export * from "./types";
