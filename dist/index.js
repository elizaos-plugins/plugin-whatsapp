// src/index.ts
import { EventEmitter as EventEmitter4 } from "events";

// src/clients/baileys-client.ts
import { EventEmitter as EventEmitter2 } from "events";

// src/baileys/auth.ts
import { useMultiFileAuthState } from "@whiskeysockets/baileys";
var BaileysAuthManager = class {
  authDir;
  state;
  saveCreds;
  constructor(authDir) {
    this.authDir = authDir;
  }
  async initialize() {
    const result = await useMultiFileAuthState(this.authDir);
    this.state = result.state;
    this.saveCreds = result.saveCreds;
    return this.state;
  }
  async save() {
    if (this.saveCreds) {
      await this.saveCreds();
    }
  }
  getState() {
    return this.state;
  }
};

// src/baileys/connection.ts
import makeWASocket, { DisconnectReason } from "@whiskeysockets/baileys";
import pino from "pino";
import { EventEmitter } from "events";
var BaileysConnection = class extends EventEmitter {
  socket;
  authManager;
  connectionStatus = "close";
  reconnecting = false;
  reconnectAttempts = 0;
  MAX_RECONNECT_ATTEMPTS = 10;
  constructor(authManager) {
    super();
    this.authManager = authManager;
  }
  async connect() {
    var _a;
    const state = await this.authManager.initialize();
    if ((_a = this.socket) == null ? void 0 : _a.ev) {
      this.socket.ev.removeAllListeners("connection.update");
      this.socket.ev.removeAllListeners("creds.update");
      this.socket.ev.removeAllListeners("messages.upsert");
    }
    this.socket = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: "silent" }),
      browser: ["Chrome (Linux)", "", ""]
    });
    this.setupEventHandlers();
    return this.socket;
  }
  setupEventHandlers() {
    if (!this.socket) return;
    this.socket.ev.on("connection.update", async (update) => {
      var _a, _b;
      const { connection, qr, lastDisconnect } = update;
      if (qr) {
        this.emit("qr", qr);
      }
      if (connection) {
        this.connectionStatus = connection;
        this.emit("connection", connection);
      }
      if (connection === "close") {
        const statusCode = (_b = (_a = lastDisconnect == null ? void 0 : lastDisconnect.error) == null ? void 0 : _a.output) == null ? void 0 : _b.statusCode;
        if (statusCode === 405) {
          console.error("WhatsApp rejected the connection (405). This usually means:");
          console.error("  - Baileys version is outdated");
          console.error("  - WhatsApp protocol has changed");
          console.error("  - Browser info is rejected by WhatsApp");
          this.emit("error", new Error("WhatsApp connection rejected (405). Try updating @whiskeysockets/baileys"));
          return;
        }
        const isQRTimeout = statusCode === 515;
        if (isQRTimeout) {
          console.log("QR code timed out, generating new one...");
        }
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        if ((lastDisconnect == null ? void 0 : lastDisconnect.error) && !isQRTimeout) {
          console.error("Connection error:", lastDisconnect.error.message || lastDisconnect.error);
        }
        if (shouldReconnect && statusCode !== 405) {
          if (this.reconnecting) {
            return;
          }
          if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
            console.error(`Max reconnection attempts (${this.MAX_RECONNECT_ATTEMPTS}) reached. Giving up.`);
            this.emit("error", new Error("Max reconnection attempts reached"));
            return;
          }
          this.reconnecting = true;
          try {
            this.reconnectAttempts++;
            const baseDelay = isQRTimeout ? 1e3 : 3e3;
            const exponentialDelay = Math.min(baseDelay * Math.pow(2, this.reconnectAttempts - 1), 3e4);
            console.log(`Reconnecting in ${exponentialDelay / 1e3} seconds... (attempt ${this.reconnectAttempts}/${this.MAX_RECONNECT_ATTEMPTS})`);
            await new Promise((resolve) => setTimeout(resolve, exponentialDelay));
            await this.connect();
          } catch (err) {
            console.error("Reconnection failed:", err);
            this.emit("error", err);
          } finally {
            this.reconnecting = false;
          }
        }
      }
      if (connection === "open") {
        this.reconnectAttempts = 0;
      }
    });
    this.socket.ev.on("creds.update", async () => {
      await this.authManager.save();
    });
    this.socket.ev.on("messages.upsert", ({ messages }) => {
      this.emit("messages", messages);
    });
  }
  getSocket() {
    return this.socket;
  }
  getStatus() {
    return this.connectionStatus;
  }
  async disconnect() {
    if (this.socket) {
      this.socket.ev.removeAllListeners("connection.update");
      this.socket.ev.removeAllListeners("creds.update");
      this.socket.ev.removeAllListeners("messages.upsert");
      if (this.socket.ws) {
        this.socket.ws.close();
      }
      this.socket = void 0;
      this.connectionStatus = "close";
      this.emit("connection", "close");
    }
  }
};

// src/baileys/qr-code.ts
import QRCode from "qrcode";
import QRCodeTerminal from "qrcode-terminal";
var QRCodeGenerator = class {
  async generate(qrString) {
    return {
      terminal: await this.generateTerminal(qrString),
      dataURL: await QRCode.toDataURL(qrString),
      raw: qrString
    };
  }
  async generateTerminal(qr) {
    return new Promise((resolve) => {
      QRCodeTerminal.generate(qr, { small: true }, (output) => {
        resolve(output);
      });
    });
  }
};

// src/baileys/message-adapter.ts
var MessageAdapter = class {
  // Convert Baileys message to unified format
  toUnified(msg) {
    var _a, _b;
    return {
      id: ((_a = msg.key) == null ? void 0 : _a.id) ?? "",
      from: ((_b = msg.key) == null ? void 0 : _b.remoteJid) ?? "",
      timestamp: Number(msg.messageTimestamp ?? 0),
      type: this.detectType(msg),
      content: this.extractContent(msg)
    };
  }
  // Convert unified message to Baileys format
  toBaileys(msg) {
    if (msg.type === "text") {
      return { text: msg.content };
    }
    throw new Error(`Message type ${msg.type} not yet supported for Baileys`);
  }
  detectType(msg) {
    var _a, _b, _c, _d, _e, _f;
    if ((_a = msg.message) == null ? void 0 : _a.conversation) return "text";
    if ((_b = msg.message) == null ? void 0 : _b.extendedTextMessage) return "text";
    if ((_c = msg.message) == null ? void 0 : _c.imageMessage) return "image";
    if ((_d = msg.message) == null ? void 0 : _d.audioMessage) return "audio";
    if ((_e = msg.message) == null ? void 0 : _e.videoMessage) return "video";
    if ((_f = msg.message) == null ? void 0 : _f.documentMessage) return "document";
    return "text";
  }
  extractContent(msg) {
    var _a, _b, _c;
    return ((_a = msg.message) == null ? void 0 : _a.conversation) || ((_c = (_b = msg.message) == null ? void 0 : _b.extendedTextMessage) == null ? void 0 : _c.text) || "";
  }
};

// src/clients/baileys-client.ts
var BaileysClient = class extends EventEmitter2 {
  config;
  authManager;
  connection;
  qrGenerator;
  adapter;
  constructor(config) {
    super();
    this.config = config;
    this.authManager = new BaileysAuthManager(config.authDir);
    this.connection = new BaileysConnection(this.authManager);
    this.qrGenerator = new QRCodeGenerator();
    this.adapter = new MessageAdapter();
    this.setupEventForwarding();
  }
  setupEventForwarding() {
    this.connection.on("qr", async (qr) => {
      try {
        const qrData = await this.qrGenerator.generate(qr);
        if (this.config.printQRInTerminal !== false) {
          console.log("\n=== Scan QR Code ===\n");
          console.log(qrData.terminal);
        }
        this.emit("qr", qrData);
      } catch (err) {
        console.error("QR code generation failed:", err);
        this.emit("error", err);
      }
    });
    this.connection.on("connection", (status) => {
      this.emit("connection", status);
      if (status === "open") {
        this.emit("ready");
      }
    });
    this.connection.on("messages", (messages) => {
      for (const msg of messages) {
        if (!msg.key.fromMe && msg.message) {
          const unified = this.adapter.toUnified(msg);
          this.emit("message", unified);
        }
      }
    });
    this.connection.on("error", (err) => {
      this.emit("error", err);
    });
  }
  async start() {
    await this.connection.connect();
  }
  async stop() {
    await this.connection.disconnect();
  }
  async sendMessage(message) {
    const socket = this.connection.getSocket();
    if (!socket) {
      throw new Error("Not connected to WhatsApp");
    }
    const content = this.adapter.toBaileys(message);
    return socket.sendMessage(message.to, content);
  }
  getConnectionStatus() {
    return this.connection.getStatus();
  }
};

// src/clients/cloud-api-client.ts
import axios from "axios";
import { EventEmitter as EventEmitter3 } from "events";
var CloudAPIClient = class extends EventEmitter3 {
  client;
  config;
  constructor(config) {
    super();
    this.config = config;
    const apiVersion = config.apiVersion || "v24.0";
    this.client = axios.create({
      baseURL: `https://graph.facebook.com/${apiVersion}`,
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        "Content-Type": "application/json"
      }
    });
  }
  async start() {
    this.emit("ready");
  }
  async stop() {
  }
  async sendMessage(message) {
    const endpoint = `/${this.config.phoneNumberId}/messages`;
    const payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: message.to,
      type: message.type,
      ...message.type === "text" ? { text: { body: message.content } } : { template: message.content }
    };
    return this.client.post(endpoint, payload);
  }
  async verifyWebhook(token) {
    return token === this.config.webhookVerifyToken;
  }
  getConnectionStatus() {
    return "open";
  }
};

// src/utils/config-detector.ts
function detectAuthMethod(config) {
  if (config.authMethod) {
    if (config.authMethod !== "baileys" && config.authMethod !== "cloudapi") {
      throw new Error(
        `Invalid authMethod: "${config.authMethod}". Must be either "baileys" or "cloudapi".`
      );
    }
    return config.authMethod;
  }
  if (config.authDir || config.sessionPath || config.authState) {
    return "baileys";
  }
  if (config.accessToken && config.phoneNumberId) {
    return "cloudapi";
  }
  throw new Error(
    "Cannot detect auth method. Provide either:\n  - authDir (for Baileys QR code)\n  - accessToken + phoneNumberId (for Cloud API)"
  );
}

// src/clients/factory.ts
var ClientFactory = class {
  static create(config) {
    const authMethod = detectAuthMethod(config);
    if (authMethod === "baileys") {
      return new BaileysClient(config);
    } else {
      return new CloudAPIClient(config);
    }
  }
};

// src/handlers/message.handler.ts
var MessageHandler = class {
  constructor(client) {
    this.client = client;
  }
  async send(message) {
    try {
      const response = await this.client.sendMessage(message);
      return (response == null ? void 0 : response.data) ?? response;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(
          `Failed to send WhatsApp message: ${error.message}`
        );
      }
      throw new Error("Failed to send WhatsApp message");
    }
  }
};

// src/handlers/webhook.handler.ts
var WebhookHandler = class {
  constructor(client) {
    this.client = client;
  }
  async handle(event) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j;
    try {
      if ((_e = (_d = (_c = (_b = (_a = event.entry) == null ? void 0 : _a[0]) == null ? void 0 : _b.changes) == null ? void 0 : _c[0]) == null ? void 0 : _d.value) == null ? void 0 : _e.messages) {
        const messages = event.entry[0].changes[0].value.messages;
        for (const message of messages) {
          await this.handleMessage(message);
        }
      }
      if ((_j = (_i = (_h = (_g = (_f = event.entry) == null ? void 0 : _f[0]) == null ? void 0 : _g.changes) == null ? void 0 : _h[0]) == null ? void 0 : _i.value) == null ? void 0 : _j.statuses) {
        const statuses = event.entry[0].changes[0].value.statuses;
        for (const status of statuses) {
          await this.handleStatus(status);
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(
          `Failed to send WhatsApp message: ${error.message}`
        );
      }
      throw new Error("Failed to send WhatsApp message");
    }
  }
  async handleMessage(message) {
    console.log("Received message:", message);
  }
  async handleStatus(status) {
    console.log("Received status update:", status);
  }
};

// src/service.ts
import {
  Service,
  EventType,
  ChannelType,
  logger,
  stringToUuid
} from "@elizaos/core";
var SOURCE = "whatsapp";
var WhatsAppConnectorService = class _WhatsAppConnectorService extends Service {
  static serviceType = "whatsapp_connector";
  capabilityDescription = "Connects the agent to WhatsApp using Baileys (QR code) or Cloud API";
  plugin = null;
  static async start(runtime) {
    const service = new _WhatsAppConnectorService(runtime);
    await service.initialize();
    return service;
  }
  async stop() {
    if (this.plugin) {
      await this.plugin.stop();
      this.plugin = null;
      logger.info("[WhatsApp] Disconnected");
    }
  }
  resolveConfig() {
    const runtime = this.runtime;
    const authDir = runtime.getSetting("WHATSAPP_AUTH_DIR");
    if (authDir) {
      return { authDir: String(authDir), printQRInTerminal: true };
    }
    const accessToken = runtime.getSetting("WHATSAPP_ACCESS_TOKEN");
    const phoneNumberId = runtime.getSetting("WHATSAPP_PHONE_NUMBER_ID");
    if (accessToken && phoneNumberId) {
      const webhookVerifyToken = runtime.getSetting("WHATSAPP_WEBHOOK_VERIFY_TOKEN");
      const businessAccountId = runtime.getSetting("WHATSAPP_BUSINESS_ID");
      const apiVersion = runtime.getSetting("WHATSAPP_API_VERSION");
      return {
        accessToken: String(accessToken),
        phoneNumberId: String(phoneNumberId),
        webhookVerifyToken: webhookVerifyToken ? String(webhookVerifyToken) : void 0,
        businessAccountId: businessAccountId ? String(businessAccountId) : void 0,
        apiVersion: apiVersion ? String(apiVersion) : void 0
      };
    }
    return null;
  }
  async initialize() {
    const runtime = this.runtime;
    const config = this.resolveConfig();
    if (!config) {
      logger.warn(
        "[WhatsApp] No configuration found (set WHATSAPP_AUTH_DIR for Baileys or WHATSAPP_ACCESS_TOKEN + WHATSAPP_PHONE_NUMBER_ID for Cloud API) \u2014 connector disabled"
      );
      return;
    }
    this.plugin = new WhatsAppPlugin(config);
    this.plugin.on("qr", (qrData) => {
      logger.info("[WhatsApp] Scan the QR code below with your phone:");
      process.stdout.write("\n" + (qrData.terminal ?? String(qrData)) + "\n\n");
    });
    this.plugin.on("ready", () => {
      logger.info("[WhatsApp] Connected!");
    });
    this.plugin.on("connection", (status) => {
      logger.info(`[WhatsApp] Connection status: ${status}`);
    });
    this.plugin.on("error", (err) => {
      logger.error("[WhatsApp] Error:", err.message);
    });
    this.plugin.on("message", async (msg) => {
      await this.handleIncomingMessage(msg);
    });
    runtime.registerSendHandler(
      SOURCE,
      async (_rt, target, content) => {
        if (!this.plugin || !content.text) return;
        const to = target.channelId ?? (target.entityId ? String(target.entityId) : null);
        if (!to) return;
        await this.plugin.sendMessage({
          type: "text",
          to,
          content: content.text
        });
      }
    );
    await this.plugin.start();
    logger.info("[WhatsApp] Connector service started");
  }
  async handleIncomingMessage(msg) {
    const runtime = this.runtime;
    if (!msg.content || msg.type !== "text") return;
    const entityId = stringToUuid(`whatsapp-entity-${msg.from}`);
    const roomId = stringToUuid(`whatsapp-room-${msg.from}-${runtime.agentId}`);
    const worldId = stringToUuid(`whatsapp-world-${runtime.agentId}`);
    await runtime.ensureWorldExists({
      id: worldId,
      agentId: runtime.agentId,
      name: "WhatsApp",
      metadata: { source: SOURCE }
    });
    await runtime.ensureConnection({
      entityId,
      roomId,
      worldId,
      userName: msg.from,
      name: msg.from,
      source: SOURCE,
      type: ChannelType.DM,
      channelId: msg.from
    });
    const memory = {
      id: stringToUuid(`whatsapp-msg-${msg.id}`),
      agentId: runtime.agentId,
      entityId,
      roomId,
      content: {
        text: msg.content,
        source: SOURCE,
        channelId: msg.from
      },
      createdAt: msg.timestamp ? msg.timestamp * 1e3 : Date.now(),
      metadata: { type: "message", timestamp: Date.now(), scope: "private" }
    };
    await runtime.createMemory(memory, "messages");
    await runtime.emitEvent(EventType.MESSAGE_RECEIVED, {
      runtime,
      message: memory,
      source: SOURCE,
      callback: async (response) => {
        if (response.text && this.plugin) {
          await this.plugin.sendMessage({
            type: "text",
            to: msg.from,
            content: response.text
          });
        }
        return [];
      }
    });
  }
};

// src/index.ts
var WhatsAppPlugin = class extends EventEmitter4 {
  client;
  messageHandler;
  webhookHandler;
  name;
  description;
  constructor(config) {
    super();
    this.name = "WhatsApp Plugin";
    this.description = "WhatsApp integration supporting both Cloud API and Baileys";
    this.client = ClientFactory.create(config);
    this.messageHandler = new MessageHandler(this.client);
    this.webhookHandler = new WebhookHandler(this.client);
    this.client.on("message", (msg) => this.emit("message", msg));
    this.client.on("qr", (qr) => this.emit("qr", qr));
    this.client.on("ready", () => this.emit("ready"));
    this.client.on("connection", (status) => this.emit("connection", status));
    this.client.on("error", (err) => this.emit("error", err));
  }
  async start() {
    await this.client.start();
  }
  async stop() {
    await this.client.stop();
  }
  async sendMessage(message) {
    return this.messageHandler.send(message);
  }
  async handleWebhook(event) {
    return this.webhookHandler.handle(event);
  }
  async verifyWebhook(token) {
    if (!this.client.verifyWebhook) {
      throw new Error("verifyWebhook is not supported by this client implementation");
    }
    return this.client.verifyWebhook(token);
  }
  getConnectionStatus() {
    return this.client.getConnectionStatus();
  }
};
var whatsappPlugin = {
  name: "whatsapp",
  description: "WhatsApp connector for ElizaOS \u2014 supports Baileys (QR code) and Cloud API",
  services: [WhatsAppConnectorService]
};
var index_default = whatsappPlugin;
export {
  ClientFactory,
  WhatsAppConnectorService,
  WhatsAppPlugin,
  index_default as default
};
//# sourceMappingURL=index.js.map