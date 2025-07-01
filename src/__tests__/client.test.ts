import { describe, expect, it, beforeEach, mock, spyOn } from "bun:test";
import axios from "axios";
import { WhatsAppClient } from "../client";
import type { WhatsAppConfig, WhatsAppMessage } from "../types";

describe("WhatsAppClient", () => {
  let client: WhatsAppClient;
  let config: WhatsAppConfig;
  let mockAxiosCreate: any;
  let mockAxiosInstance: any;

  beforeEach(() => {
    config = {
      accessToken: "test-token",
      phoneNumberId: "test-phone-id",
      webhookVerifyToken: "test-webhook-token",
      businessAccountId: "test-business-id",
    };

    // Mock axios instance
    mockAxiosInstance = {
      post: mock().mockResolvedValue({ data: { message_id: "test-id" } }),
    };

    // Mock axios.create
    mockAxiosCreate = spyOn(axios, "create").mockReturnValue(mockAxiosInstance);

    client = new WhatsAppClient(config);
  });

  describe("constructor", () => {
    it("should create axios instance with correct config", () => {
      expect(mockAxiosCreate).toHaveBeenCalledWith({
        baseURL: "https://graph.facebook.com/v17.0",
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          "Content-Type": "application/json",
        },
      });
    });
  });

  describe("sendMessage", () => {
    it("should send text message correctly", async () => {
      const message: WhatsAppMessage = {
        type: "text",
        to: "+1234567890",
        content: "Hello, World!",
      };

      const result = await client.sendMessage(message);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        `/${config.phoneNumberId}/messages`,
        {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: message.to,
          type: "text",
          text: { body: "Hello, World!" },
        }
      );

      expect(result.data.message_id).toBe("test-id");
    });

    it("should send template message correctly", async () => {
      const templateContent = {
        name: "hello_world",
        language: { code: "en_US" },
        components: [
          {
            type: "body",
            parameters: [{ type: "text", text: "World" }],
          },
        ],
      };

      const message: WhatsAppMessage = {
        type: "template",
        to: "+1234567890",
        content: templateContent,
      };

      const result = await client.sendMessage(message);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        `/${config.phoneNumberId}/messages`,
        {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: message.to,
          type: "template",
          template: templateContent,
        }
      );

      expect(result.data.message_id).toBe("test-id");
    });

    it("should handle API errors", async () => {
      const errorResponse = {
        response: {
          data: {
            error: {
              message: "Invalid access token",
              type: "OAuthException",
              code: 190,
            },
          },
        },
      };

      mockAxiosInstance.post.mockRejectedValueOnce(errorResponse);

      const message: WhatsAppMessage = {
        type: "text",
        to: "+1234567890",
        content: "Test",
      };

      await expect(client.sendMessage(message)).rejects.toThrow();
    });
  });

  describe("verifyWebhook", () => {
    it("should return true for matching token", async () => {
      const result = await client.verifyWebhook("test-webhook-token");
      expect(result).toBe(true);
    });

    it("should return false for non-matching token", async () => {
      const result = await client.verifyWebhook("wrong-token");
      expect(result).toBe(false);
    });

    it("should return false when webhookVerifyToken is not set", async () => {
      const configWithoutWebhook: WhatsAppConfig = {
        accessToken: "test-token",
        phoneNumberId: "test-phone-id",
      };
      const clientWithoutWebhook = new WhatsAppClient(configWithoutWebhook);

      const result = await clientWithoutWebhook.verifyWebhook("any-token");
      expect(result).toBe(false);
    });
  });
});
