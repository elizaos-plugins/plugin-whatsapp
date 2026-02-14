import { describe, expect, it } from "vitest";
import { detectAuthMethod } from "./config-detector";

describe("detectAuthMethod", () => {
  it("detects cloudapi from accessToken + phoneNumberId", () => {
    expect(
      detectAuthMethod({
        accessToken: "token",
        phoneNumberId: "123",
      })
    ).toBe("cloudapi");
  });

  it("detects baileys from authDir", () => {
    expect(
      detectAuthMethod({
        authDir: "./auth",
      })
    ).toBe("baileys");
  });

  it("throws for invalid explicit authMethod", () => {
    expect(() =>
      detectAuthMethod({
        authMethod: "invalid" as never,
        accessToken: "token",
        phoneNumberId: "123",
      })
    ).toThrow('Invalid authMethod: "invalid"');
  });
});
