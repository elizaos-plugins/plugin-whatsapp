import {
  describe,
  expect,
  it,
  beforeEach,
  afterEach,
  mock,
  spyOn,
} from "bun:test";
import { WebhookHandler } from "../../handlers/webhook.handler";
import { WhatsAppClient } from "../../client";
import type { WhatsAppWebhookEvent } from "../../types";

describe("WebhookHandler", () => {
  let handler: WebhookHandler;
  let mockClient: any;
  let consoleLogSpy: any;

  beforeEach(() => {
    // Create a mock client
    mockClient = {} as WhatsAppClient;
    handler = new WebhookHandler(mockClient);

    // Spy on console.log
    consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    // Reset all mocks after each test
    mock.restore();
  });

  describe("handle", () => {
    it("should handle message events", async () => {
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
                },
              },
            ],
          },
        ],
      };

      await handler.handle(event);

      expect(consoleLogSpy).toHaveBeenCalledWith("Received message:", {
        from: "+0987654321",
        id: "message-id",
        timestamp: "1234567890",
        type: "text",
        text: {
          body: "Test message",
        },
      });
    });

    it("should handle status events", async () => {
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
                  statuses: [
                    {
                      id: "message-id",
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

      await handler.handle(event);

      expect(consoleLogSpy).toHaveBeenCalledWith("Received status update:", {
        id: "message-id",
        status: "delivered",
        timestamp: "1234567890",
        recipient_id: "+0987654321",
      });
    });

    it("should handle events with both messages and statuses", async () => {
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
                      text: { body: "Test" },
                    },
                  ],
                  statuses: [
                    {
                      id: "status-id",
                      status: "read",
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

      await handler.handle(event);

      expect(consoleLogSpy).toHaveBeenCalledTimes(2);
    });

    it("should handle empty events gracefully", async () => {
      const event: WhatsAppWebhookEvent = {
        object: "whatsapp_business_account",
        entry: [],
      };

      await expect(handler.handle(event)).resolves.toBeUndefined();
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it("should handle events without messages or statuses", async () => {
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
                },
              },
            ],
          },
        ],
      };

      await expect(handler.handle(event)).resolves.toBeUndefined();
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it("should handle malformed message structure", async () => {
      // Create a handler that will throw when processing a message
      const errorHandler = new WebhookHandler(mockClient);

      // Mock the handleMessage method to throw an error
      const handleMessageSpy = spyOn(
        errorHandler as any,
        "handleMessage"
      ).mockRejectedValue(new Error("Processing error"));

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
                      text: { body: "Test" },
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      // This should throw with our custom error message
      await expect(errorHandler.handle(event)).rejects.toThrow(
        "Failed to send WhatsApp message: Processing error"
      );
    });

    it("should handle multiple entries", async () => {
      const event: WhatsAppWebhookEvent = {
        object: "whatsapp_business_account",
        entry: [
          {
            id: "test-id-1",
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
                      from: "+1111111111",
                      id: "message-1",
                      timestamp: "1234567890",
                      type: "text",
                      text: { body: "Message 1" },
                    },
                  ],
                },
              },
            ],
          },
          {
            id: "test-id-2",
            changes: [
              {
                field: "messages",
                value: {
                  messaging_product: "whatsapp",
                  metadata: {
                    display_phone_number: "+0987654321",
                    phone_number_id: "test-phone-id-2",
                  },
                  messages: [
                    {
                      from: "+2222222222",
                      id: "message-2",
                      timestamp: "1234567891",
                      type: "text",
                      text: { body: "Message 2" },
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      await handler.handle(event);

      // Should only process the first entry
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      expect(consoleLogSpy).toHaveBeenCalledWith("Received message:", {
        from: "+1111111111",
        id: "message-1",
        timestamp: "1234567890",
        type: "text",
        text: { body: "Message 1" },
      });
    });
  });
});
