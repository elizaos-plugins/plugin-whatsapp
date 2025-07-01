import { describe, expect, it } from "bun:test";
import {
  validateConfig,
  validateMessage,
  validateTemplate,
  validatePhoneNumber,
} from "../../utils/validators";
import type {
  WhatsAppConfig,
  WhatsAppMessage,
  WhatsAppTemplate,
} from "../../types";

describe("Validators", () => {
  describe("validateConfig", () => {
    it("should pass with valid config", () => {
      const config: WhatsAppConfig = {
        accessToken: "test-token",
        phoneNumberId: "test-phone-id",
      };

      expect(() => validateConfig(config)).not.toThrow();
    });

    it("should throw when accessToken is missing", () => {
      const config = {
        phoneNumberId: "test-phone-id",
      } as WhatsAppConfig;

      expect(() => validateConfig(config)).toThrow(
        "WhatsApp access token is required"
      );
    });

    it("should throw when phoneNumberId is missing", () => {
      const config = {
        accessToken: "test-token",
      } as WhatsAppConfig;

      expect(() => validateConfig(config)).toThrow(
        "WhatsApp phone number ID is required"
      );
    });

    it("should pass with all optional fields", () => {
      const config: WhatsAppConfig = {
        accessToken: "test-token",
        phoneNumberId: "test-phone-id",
        webhookVerifyToken: "webhook-token",
        businessAccountId: "business-id",
      };

      expect(() => validateConfig(config)).not.toThrow();
    });
  });

  describe("validateMessage", () => {
    it("should pass with valid text message", () => {
      const message: WhatsAppMessage = {
        type: "text",
        to: "+1234567890",
        content: "Hello",
      };

      expect(() => validateMessage(message)).not.toThrow();
    });

    it("should pass with valid template message", () => {
      const message: WhatsAppMessage = {
        type: "template",
        to: "+1234567890",
        content: {
          name: "hello_world",
          language: { code: "en_US" },
        },
      };

      expect(() => validateMessage(message)).not.toThrow();
    });

    it("should throw when to is missing", () => {
      const message = {
        type: "text",
        content: "Hello",
      } as WhatsAppMessage;

      expect(() => validateMessage(message)).toThrow(
        "Recipient phone number is required"
      );
    });

    it("should throw when type is missing", () => {
      const message = {
        to: "+1234567890",
        content: "Hello",
      } as any;

      expect(() => validateMessage(message)).toThrow(
        "Message type is required"
      );
    });

    it("should throw when content is missing", () => {
      const message = {
        type: "text",
        to: "+1234567890",
      } as any;

      expect(() => validateMessage(message)).toThrow(
        "Message content is required"
      );
    });
  });

  describe("validateTemplate", () => {
    it("should pass with valid template", () => {
      const template: WhatsAppTemplate = {
        name: "hello_world",
        language: { code: "en_US" },
      };

      expect(() => validateTemplate(template)).not.toThrow();
    });

    it("should pass with template components", () => {
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

      expect(() => validateTemplate(template)).not.toThrow();
    });

    it("should throw when name is missing", () => {
      const template = {
        language: { code: "en_US" },
      } as WhatsAppTemplate;

      expect(() => validateTemplate(template)).toThrow(
        "Template name is required"
      );
    });

    it("should throw when language is missing", () => {
      const template = {
        name: "hello_world",
      } as WhatsAppTemplate;

      expect(() => validateTemplate(template)).toThrow(
        "Template language code is required"
      );
    });

    it("should throw when language code is missing", () => {
      const template = {
        name: "hello_world",
        language: {},
      } as any;

      expect(() => validateTemplate(template)).toThrow(
        "Template language code is required"
      );
    });
  });

  describe("validatePhoneNumber", () => {
    it("should return true for valid phone numbers", () => {
      expect(validatePhoneNumber("1234567890")).toBe(true);
      expect(validatePhoneNumber("1")).toBe(true);
      expect(validatePhoneNumber("123456789012345")).toBe(true); // 15 digits max
    });

    it("should return false for invalid phone numbers", () => {
      expect(validatePhoneNumber("+")).toBe(false);
      expect(validatePhoneNumber("+1234567890")).toBe(false); // contains +
      expect(validatePhoneNumber("123-456-7890")).toBe(false); // contains -
      expect(validatePhoneNumber("abc")).toBe(false); // contains letters
      expect(validatePhoneNumber("")).toBe(false); // empty
      expect(validatePhoneNumber("1234567890123456")).toBe(false); // 16 digits (too long)
      expect(validatePhoneNumber(" 1234567890")).toBe(false); // contains space
    });
  });
});
