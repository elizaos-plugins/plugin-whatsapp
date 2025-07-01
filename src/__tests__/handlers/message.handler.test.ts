import { describe, expect, it, beforeEach, mock } from "bun:test";
import { MessageHandler } from "../../handlers/message.handler";
import { WhatsAppClient } from "../../client";
import type { WhatsAppMessage } from "../../types";

describe("MessageHandler", () => {
  let handler: MessageHandler;
  let mockClient: any;

  beforeEach(() => {
    // Create a mock client
    mockClient = {
      sendMessage: mock().mockResolvedValue({
        data: { message_id: "test-id" },
      }),
    } as unknown as WhatsAppClient;

    handler = new MessageHandler(mockClient);
  });

  describe("send", () => {
    it("should send message successfully", async () => {
      const message: WhatsAppMessage = {
        type: "text",
        to: "+1234567890",
        content: "Test message",
      };

      const result = await handler.send(message);

      expect(mockClient.sendMessage).toHaveBeenCalledWith(message);
      expect(result).toEqual({ message_id: "test-id" });
    });

    it("should handle error from client", async () => {
      const message: WhatsAppMessage = {
        type: "text",
        to: "+1234567890",
        content: "Test message",
      };

      const error = new Error("Network error");
      mockClient.sendMessage.mockRejectedValueOnce(error);

      await expect(handler.send(message)).rejects.toThrow(
        "Failed to send WhatsApp message: Network error"
      );
    });

    it("should handle non-Error objects", async () => {
      const message: WhatsAppMessage = {
        type: "text",
        to: "+1234567890",
        content: "Test message",
      };

      mockClient.sendMessage.mockRejectedValueOnce("String error");

      await expect(handler.send(message)).rejects.toThrow(
        "Failed to send WhatsApp message"
      );
    });

    it("should handle template messages", async () => {
      const message: WhatsAppMessage = {
        type: "template",
        to: "+1234567890",
        content: {
          name: "hello_world",
          language: { code: "en_US" },
        },
      };

      const result = await handler.send(message);

      expect(mockClient.sendMessage).toHaveBeenCalledWith(message);
      expect(result).toEqual({ message_id: "test-id" });
    });

    it("should handle empty content", async () => {
      const message: WhatsAppMessage = {
        type: "text",
        to: "+1234567890",
        content: "",
      };

      const result = await handler.send(message);

      expect(mockClient.sendMessage).toHaveBeenCalledWith(message);
      expect(result).toEqual({ message_id: "test-id" });
    });

    it("should handle special characters in content", async () => {
      const message: WhatsAppMessage = {
        type: "text",
        to: "+1234567890",
        content: "Test with special chars: 🎉 & <html>",
      };

      const result = await handler.send(message);

      expect(mockClient.sendMessage).toHaveBeenCalledWith(message);
      expect(result).toEqual({ message_id: "test-id" });
    });
  });
});
