import { EventEmitter } from 'events';
import { Plugin } from '@elizaos/core';

type WhatsAppConfig = BaileysConfig | CloudAPIConfig;
interface BaileysConfig {
    authMethod?: 'baileys';
    authDir: string;
    sessionPath?: string;
    printQRInTerminal?: boolean;
}
interface CloudAPIConfig {
    authMethod?: 'cloudapi';
    accessToken: string;
    phoneNumberId: string;
    webhookVerifyToken?: string;
    businessAccountId?: string;
    apiVersion?: string;
}
interface WhatsAppMessage {
    type: "text" | "template";
    to: string;
    content: string | WhatsAppTemplate;
}
interface WhatsAppTemplate {
    name: string;
    language: {
        code: string;
    };
    components?: Array<{
        type: string;
        parameters: Array<{
            type: string;
            text?: string;
        }>;
    }>;
}
interface WhatsAppWebhookEvent {
    object: string;
    entry: Array<{
        id: string;
        changes: Array<{
            value: {
                messaging_product: string;
                metadata: {
                    display_phone_number: string;
                    phone_number_id: string;
                };
                statuses?: Array<{
                    id: string;
                    status: string;
                    timestamp: string;
                    recipient_id: string;
                }>;
                messages?: Array<{
                    from: string;
                    id: string;
                    timestamp: string;
                    text?: {
                        body: string;
                    };
                    type: string;
                }>;
            };
            field: string;
        }>;
    }>;
}
interface QRCodeData {
    terminal: string;
    dataURL: string;
    raw: string;
}
type ConnectionStatus = 'connecting' | 'open' | 'close';
interface UnifiedMessage {
    id: string;
    from: string;
    timestamp: number;
    type: 'text' | 'image' | 'audio' | 'video' | 'document';
    content: string;
}

interface IWhatsAppClient extends EventEmitter {
    start(): Promise<void>;
    stop(): Promise<void>;
    sendMessage(message: WhatsAppMessage): Promise<any>;
    verifyWebhook(token: string): Promise<boolean>;
    getConnectionStatus(): ConnectionStatus;
}

declare class ClientFactory {
    static create(config: WhatsAppConfig): IWhatsAppClient;
}

declare class WhatsAppPlugin extends EventEmitter implements Plugin {
    private client;
    private messageHandler;
    private webhookHandler;
    name: string;
    description: string;
    constructor(config: WhatsAppConfig);
    start(): Promise<void>;
    stop(): Promise<void>;
    sendMessage(message: WhatsAppMessage): Promise<any>;
    handleWebhook(event: WhatsAppWebhookEvent): Promise<void>;
    verifyWebhook(token: string): Promise<boolean>;
    getConnectionStatus(): ConnectionStatus;
}

export { type BaileysConfig, ClientFactory, type CloudAPIConfig, type ConnectionStatus, type QRCodeData, type UnifiedMessage, type WhatsAppConfig, type WhatsAppMessage, WhatsAppPlugin, type WhatsAppTemplate, type WhatsAppWebhookEvent };
