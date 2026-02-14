import type { IWhatsAppClient } from "../clients/interface";
import type { WhatsAppMessage } from "../types";

export class MessageHandler {
    constructor(private client: IWhatsAppClient) {}

    async send(message: WhatsAppMessage): Promise<any> {
        try {
            const response = await this.client.sendMessage(message);
            // Cloud API returns { data: ... }, Baileys returns the response directly
            return response?.data ?? response;
        } catch (error: unknown) {
            if (error instanceof Error) {
                throw new Error(
                    `Failed to send WhatsApp message: ${error.message}`
                );
            }
            throw new Error("Failed to send WhatsApp message");
        }
    }
}
