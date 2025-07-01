// src/client.ts
import axios from "axios";
var WhatsAppClient = class {
  client;
  config;
  constructor(config) {
    this.config = config;
    this.client = axios.create({
      baseURL: "https://graph.facebook.com/v17.0",
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        "Content-Type": "application/json"
      }
    });
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
};

// src/handlers/message.handler.ts
var MessageHandler = class {
  constructor(client) {
    this.client = client;
  }
  async send(message) {
    try {
      const response = await this.client.sendMessage(message);
      return response.data;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to send WhatsApp message: ${error.message}`);
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
    try {
      if (event.entry?.[0]?.changes?.[0]?.value?.messages) {
        const messages = event.entry[0].changes[0].value.messages;
        for (const message of messages) {
          await this.handleMessage(message);
        }
      }
      if (event.entry?.[0]?.changes?.[0]?.value?.statuses) {
        const statuses = event.entry[0].changes[0].value.statuses;
        for (const status of statuses) {
          await this.handleStatus(status);
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to send WhatsApp message: ${error.message}`);
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
var WhatsAppPlugin = class {
  client;
  messageHandler;
  webhookHandler;
  name;
  description;
  constructor(config) {
    this.name = "WhatsApp Cloud API Plugin";
    this.description = "A plugin for integrating WhatsApp Cloud API with your application.";
    this.client = new WhatsAppClient(config);
    this.messageHandler = new MessageHandler(this.client);
    this.webhookHandler = new WebhookHandler(this.client);
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
};
export {
  WhatsAppPlugin
};
//# sourceMappingURL=index.js.map