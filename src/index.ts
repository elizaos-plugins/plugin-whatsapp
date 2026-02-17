import { EventEmitter } from 'events';
import type { Plugin } from "@elizaos/core";
import type { IWhatsAppClient } from "./clients/interface";
import { ClientFactory } from "./clients/factory";
import type { WhatsAppConfig, WhatsAppMessage, WhatsAppWebhookEvent } from "./types";
import { MessageHandler, WebhookHandler } from "./handlers";
import { WhatsAppConnectorService } from "./service";

export class WhatsAppPlugin extends EventEmitter implements Plugin {
    private client: IWhatsAppClient;
    private messageHandler: MessageHandler;
    private webhookHandler: WebhookHandler;

    name: string;
    description: string;

    constructor(config: WhatsAppConfig) {
        super();
        this.name = "WhatsApp Plugin";
        this.description = "WhatsApp integration supporting both Cloud API and Baileys";

        this.client = ClientFactory.create(config);
        this.messageHandler = new MessageHandler(this.client);
        this.webhookHandler = new WebhookHandler(this.client);

        // Forward client events
        this.client.on('message', (msg) => this.emit('message', msg));
        this.client.on('qr', (qr) => this.emit('qr', qr));
        this.client.on('ready', () => this.emit('ready'));
        this.client.on('connection', (status) => this.emit('connection', status));
        this.client.on('error', (err) => this.emit('error', err));
    }

    async start(): Promise<void> {
        await this.client.start();
    }

    async stop(): Promise<void> {
        await this.client.stop();
    }

    async sendMessage(message: WhatsAppMessage): Promise<any> {
        return this.messageHandler.send(message);
    }

    async handleWebhook(event: WhatsAppWebhookEvent): Promise<void> {
        return this.webhookHandler.handle(event);
    }

    async verifyWebhook(token: string): Promise<boolean> {
        if (!this.client.verifyWebhook) {
            throw new Error('verifyWebhook is not supported by this client implementation');
        }
        return this.client.verifyWebhook(token);
    }

    getConnectionStatus() {
        return this.client.getConnectionStatus();
    }
}

export * from "./types";
export { ClientFactory } from "./clients/factory";
export { WhatsAppConnectorService } from "./service";

const whatsappPlugin: Plugin = {
  name: "whatsapp",
  description: "WhatsApp connector for ElizaOS — supports Baileys (QR code) and Cloud API",
  services: [WhatsAppConnectorService],
};

export default whatsappPlugin;
