import axios, { type AxiosInstance } from "axios";
import { EventEmitter } from "events";
import type { IWhatsAppClient } from "./interface";
import type { CloudAPIConfig, WhatsAppMessage, ConnectionStatus } from "../types";

export class CloudAPIClient extends EventEmitter implements IWhatsAppClient {
    private client: AxiosInstance;
    private config: CloudAPIConfig;

    constructor(config: CloudAPIConfig) {
        super();
        this.config = config;
        // Default to v24.0 (current version). Supported range: v19.0 - v24.0
        const apiVersion = config.apiVersion || 'v24.0';
        this.client = axios.create({
            baseURL: `https://graph.facebook.com/${apiVersion}`,
            headers: {
                Authorization: `Bearer ${config.accessToken}`,
                "Content-Type": "application/json",
            },
        });
    }

    async start(): Promise<void> {
        // Cloud API doesn't need initialization
        // Emit ready immediately
        this.emit('ready');
    }

    async stop(): Promise<void> {
        // Cloud API doesn't need cleanup
    }

    async sendMessage(message: WhatsAppMessage): Promise<any> {
        const endpoint = `/${this.config.phoneNumberId}/messages`;

        const payload = {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: message.to,
            type: message.type,
            ...(message.type === "text"
                ? { text: { body: message.content } }
                : { template: message.content }),
        };

        return this.client.post(endpoint, payload);
    }

    async verifyWebhook(token: string): Promise<boolean> {
        return token === this.config.webhookVerifyToken;
    }

    getConnectionStatus(): ConnectionStatus {
        // Cloud API is always "open" once constructed
        return 'open';
    }
}
