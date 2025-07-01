import { describe, expect, it } from "bun:test";
import type {
  WhatsAppConfig,
  WhatsAppMessage,
  WhatsAppTemplate,
  WhatsAppWebhookEvent,
} from "../types";

describe("Types", () => {
  describe("WhatsAppConfig", () => {
    it("should accept valid config", () => {
      const config: WhatsAppConfig = {
        accessToken: "test-token",
        phoneNumberId: "test-phone-id",
        webhookVerifyToken: "test-webhook-token",
        businessAccountId: "test-business-id",
      };

      expect(config.accessToken).toBe("test-token");
      expect(config.phoneNumberId).toBe("test-phone-id");
      expect(config.webhookVerifyToken).toBe("test-webhook-token");
      expect(config.businessAccountId).toBe("test-business-id");
    });

    it("should accept config without optional fields", () => {
      const config: WhatsAppConfig = {
        accessToken: "test-token",
        phoneNumberId: "test-phone-id",
      };

      expect(config.accessToken).toBe("test-token");
      expect(config.phoneNumberId).toBe("test-phone-id");
      expect(config.webhookVerifyToken).toBeUndefined();
      expect(config.businessAccountId).toBeUndefined();
    });
  });

  describe("WhatsAppMessage", () => {
    it("should accept text message", () => {
      const message: WhatsAppMessage = {
        type: "text",
        to: "+1234567890",
        content: "Hello, World!",
      };

      expect(message.type).toBe("text");
      expect(message.to).toBe("+1234567890");
      expect(message.content).toBe("Hello, World!");
    });

    it("should accept template message", () => {
      const template: WhatsAppTemplate = {
        name: "hello_world",
        language: { code: "en_US" },
        components: [
          {
            type: "body",
            parameters: [
              {
                type: "text",
                text: "World",
              },
            ],
          },
        ],
      };

      const message: WhatsAppMessage = {
        type: "template",
        to: "+1234567890",
        content: template,
      };

      expect(message.type).toBe("template");
      expect(message.to).toBe("+1234567890");
      expect(message.content).toEqual(template);
    });
  });

  describe("WhatsAppWebhookEvent", () => {
    it("should accept webhook event structure", () => {
      const event: WhatsAppWebhookEvent = {
        object: "whatsapp_business_account",
        entry: [
          {
            id: "test-id",
            changes: [
              {
                field: "messages",
                value: {
                  messaging_product: "whatsapp",
                  metadata: {
                    display_phone_number: "+1234567890",
                    phone_number_id: "test-phone-id",
                  },
                  messages: [
                    {
                      from: "+0987654321",
                      id: "message-id",
                      timestamp: "1234567890",
                      type: "text",
                      text: {
                        body: "Test message",
                      },
                    },
                  ],
                  statuses: [
                    {
                      id: "status-id",
                      status: "delivered",
                      timestamp: "1234567890",
                      recipient_id: "+0987654321",
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      expect(event.object).toBe("whatsapp_business_account");
      expect(event.entry).toHaveLength(1);
      expect(event.entry[0].changes[0].field).toBe("messages");
      expect(event.entry[0].changes[0].value.messages?.[0].type).toBe("text");
      expect(event.entry[0].changes[0].value.statuses?.[0].status).toBe(
        "delivered"
      );
    });
  });
});
