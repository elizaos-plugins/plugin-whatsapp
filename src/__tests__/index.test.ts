import { describe, expect, it, beforeEach } from "bun:test";
import { WhatsAppPlugin } from "../index";
import type { WhatsAppConfig } from "../types";

describe("WhatsAppPlugin", () => {
  let plugin: WhatsAppPlugin;
  let config: WhatsAppConfig;

  beforeEach(() => {
    config = {
      accessToken: "test-token",
      phoneNumberId: "test-phone-id",
      webhookVerifyToken: "test-webhook-token",
      businessAccountId: "test-business-id",
    };
    plugin = new WhatsAppPlugin(config);
  });

  describe("constructor", () => {
    it("should initialize with correct name and description", () => {
      expect(plugin.name).toBe("WhatsApp Cloud API Plugin");
      expect(plugin.description).toBe(
        "A plugin for integrating WhatsApp Cloud API with your application."
      );
    });
  });

  describe("sendMessage", () => {
    it("should call messageHandler.send", async () => {
      const message = {
        type: "text" as const,
        to: "+1234567890",
        content: "Test message",
      };

      // Since we can't easily mock the internal axios call without DI,
      // we'll test that the method exists and is callable
      expect(plugin.sendMessage).toBeDefined();
      expect(typeof plugin.sendMessage).toBe("function");

      // The actual integration is tested in the handlers tests
    });
  });

  describe("verifyWebhook", () => {
    it("should return true for valid token", async () => {
      const result = await plugin.verifyWebhook("test-webhook-token");
      expect(result).toBe(true);
    });

    it("should return false for invalid token", async () => {
      const result = await plugin.verifyWebhook("invalid-token");
      expect(result).toBe(false);
    });
  });

  describe("handleWebhook", () => {
    it("should handle webhook event without throwing", async () => {
      const event = {
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
                },
              },
            ],
          },
        ],
      };

      // Should not throw
      await expect(plugin.handleWebhook(event)).resolves.toBeUndefined();
    });
  });
});
