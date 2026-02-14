// Discriminated union for config
export type WhatsAppConfig = BaileysConfig | CloudAPIConfig;

export interface BaileysConfig {
    authMethod?: 'baileys';
    authDir: string;
    sessionPath?: string;
    printQRInTerminal?: boolean;
}

export interface CloudAPIConfig {
    authMethod?: 'cloudapi';
    accessToken: string;
    phoneNumberId: string;
    webhookVerifyToken?: string;
    businessAccountId?: string;
    apiVersion?: string;
}

export interface WhatsAppMessage {
    type: "text" | "template";
    to: string;
    content: string | WhatsAppTemplate;
}

export interface WhatsAppTemplate {
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

export interface WhatsAppWebhookEvent {
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

// Event types
export interface QRCodeData {
    terminal: string;      // For console.log
    dataURL: string;       // For web UI
    raw: string;           // Raw QR string
}

export type ConnectionStatus = 'connecting' | 'open' | 'close';

// Unified message format (works for both)
export interface UnifiedMessage {
    id: string;
    from: string;
    timestamp: number;
    type: 'text' | 'image' | 'audio' | 'video' | 'document';
    content: string;
}
