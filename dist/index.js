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
  constructor(authManager) {
    super();
    this.authManager = authManager;
  }
  async connect() {
    const state = await this.authManager.initialize();
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
          const delay = isQRTimeout ? 1e3 : 3e3;
          console.log(`Reconnecting in ${delay / 1e3} seconds...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          try {
            await this.connect();
          } catch (err) {
            console.error("Reconnection failed:", err);
          }
        }
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
      this.socket.ev.removeAllListeners();
      this.socket.ws.close();
      this.socket = void 0;
      this.connectionStatus = "close";
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
    return {
      id: msg.key.id,
      from: msg.key.remoteJid,
      timestamp: Number(msg.messageTimestamp),
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
      const qrData = await this.qrGenerator.generate(qr);
      if (this.config.printQRInTerminal !== false) {
        console.log("\n=== Scan QR Code ===\n");
        console.log(qrData.terminal);
      }
      this.emit("qr", qrData);
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
  async verifyWebhook(token) {
    throw new Error("verifyWebhook is not supported with Baileys. Use Cloud API instead.");
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
    const apiVersion = config.apiVersion || "v17.0";
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
  if (config.authMethod) return config.authMethod;
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
      return (response == null ? void 0 : response.data) || response;
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
    return this.client.verifyWebhook(token);
  }
  getConnectionStatus() {
    return this.client.getConnectionStatus();
  }
};
export {
  ClientFactory,
  WhatsAppPlugin
};
//# sourceMappingURL=index.js.map