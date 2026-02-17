import {
  type IAgentRuntime,
  type Memory,
  type Content,
  type TargetInfo,
  Service,
  EventType,
  ChannelType,
  logger,
  stringToUuid,
} from "@elizaos/core";
import { WhatsAppPlugin } from "./index";
import type { WhatsAppConfig, UnifiedMessage } from "./types";

const SOURCE = "whatsapp";

export class WhatsAppConnectorService extends Service {
  static serviceType = "whatsapp_connector";
  capabilityDescription =
    "Connects the agent to WhatsApp using Baileys (QR code) or Cloud API";

  private plugin: WhatsAppPlugin | null = null;

  static async start(
    runtime: IAgentRuntime
  ): Promise<WhatsAppConnectorService> {
    const service = new WhatsAppConnectorService(runtime);
    await service.initialize();
    return service;
  }

  async stop(): Promise<void> {
    if (this.plugin) {
      await this.plugin.stop();
      this.plugin = null;
      logger.info("[WhatsApp] Disconnected");
    }
  }

  private resolveConfig(): WhatsAppConfig | null {
    const runtime = this.runtime;

    // Baileys (QR code) preferred when authDir is set
    const authDir = runtime.getSetting("WHATSAPP_AUTH_DIR");
    if (authDir) {
      return { authDir: String(authDir), printQRInTerminal: true };
    }

    // Cloud API
    const accessToken = runtime.getSetting("WHATSAPP_ACCESS_TOKEN");
    const phoneNumberId = runtime.getSetting("WHATSAPP_PHONE_NUMBER_ID");
    if (accessToken && phoneNumberId) {
      const webhookVerifyToken = runtime.getSetting("WHATSAPP_WEBHOOK_VERIFY_TOKEN");
      const businessAccountId = runtime.getSetting("WHATSAPP_BUSINESS_ID");
      const apiVersion = runtime.getSetting("WHATSAPP_API_VERSION");
      return {
        accessToken: String(accessToken),
        phoneNumberId: String(phoneNumberId),
        webhookVerifyToken: webhookVerifyToken ? String(webhookVerifyToken) : undefined,
        businessAccountId: businessAccountId ? String(businessAccountId) : undefined,
        apiVersion: apiVersion ? String(apiVersion) : undefined,
      };
    }

    return null;
  }

  private async initialize(): Promise<void> {
    const runtime = this.runtime;
    const config = this.resolveConfig();
    if (!config) {
      logger.warn(
        "[WhatsApp] No configuration found (set WHATSAPP_AUTH_DIR for Baileys or " +
        "WHATSAPP_ACCESS_TOKEN + WHATSAPP_PHONE_NUMBER_ID for Cloud API) — connector disabled"
      );
      return;
    }

    this.plugin = new WhatsAppPlugin(config);

    this.plugin.on("qr", (qrData: { terminal?: string; dataURL?: string }) => {
      logger.info("[WhatsApp] Scan the QR code below with your phone:");
      process.stdout.write("\n" + (qrData.terminal ?? String(qrData)) + "\n\n");
    });

    this.plugin.on("ready", () => {
      logger.info("[WhatsApp] Connected!");
    });

    this.plugin.on("connection", (status: string) => {
      logger.info(`[WhatsApp] Connection status: ${status}`);
    });

    this.plugin.on("error", (err: Error) => {
      logger.error("[WhatsApp] Error:", err.message);
    });

    this.plugin.on("message", async (msg: UnifiedMessage) => {
      await this.handleIncomingMessage(msg);
    });

    // Register send handler so the runtime can route replies back to WhatsApp
    runtime.registerSendHandler(
      SOURCE,
      async (_rt: IAgentRuntime, target: TargetInfo, content: Content): Promise<void> => {
        if (!this.plugin || !content.text) return;
        const to = target.channelId ?? (target.entityId ? String(target.entityId) : null);
        if (!to) return;
        await this.plugin.sendMessage({
          type: "text",
          to,
          content: content.text,
        });
      }
    );

    await this.plugin.start();
    logger.info("[WhatsApp] Connector service started");
  }

  private async handleIncomingMessage(msg: UnifiedMessage): Promise<void> {
    const runtime = this.runtime;
    if (!msg.content || msg.type !== "text") return;

    // Derive consistent UUIDs from WhatsApp JIDs
    const entityId = stringToUuid(`whatsapp-entity-${msg.from}`);
    const roomId = stringToUuid(`whatsapp-room-${msg.from}-${runtime.agentId}`);
    const worldId = stringToUuid(`whatsapp-world-${runtime.agentId}`);

    // Ensure the WhatsApp world exists
    await runtime.ensureWorldExists({
      id: worldId,
      agentId: runtime.agentId,
      name: "WhatsApp",
      metadata: { source: SOURCE },
    });

    // Ensure entity, room, and participant in one call
    await runtime.ensureConnection({
      entityId,
      roomId,
      worldId,
      userName: msg.from,
      name: msg.from,
      source: SOURCE,
      type: ChannelType.DM,
      channelId: msg.from,
    });

    const memory: Memory = {
      id: stringToUuid(`whatsapp-msg-${msg.id}`),
      agentId: runtime.agentId,
      entityId,
      roomId,
      content: {
        text: msg.content,
        source: SOURCE,
        channelId: msg.from,
      },
      createdAt: msg.timestamp ? msg.timestamp * 1000 : Date.now(),
      metadata: { type: "message", timestamp: Date.now(), scope: "private" },
    };

    await runtime.createMemory(memory, "messages");

    await runtime.emitEvent(EventType.MESSAGE_RECEIVED, {
      runtime,
      message: memory,
      source: SOURCE,
      callback: async (response: Content): Promise<Memory[]> => {
        if (response.text && this.plugin) {
          await this.plugin.sendMessage({
            type: "text",
            to: msg.from,
            content: response.text,
          });
        }
        return [];
      },
    });
  }
}
