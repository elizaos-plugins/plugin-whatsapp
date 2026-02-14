import type { proto } from "@whiskeysockets/baileys";
import type {
  UnifiedMessage,
  WhatsAppMediaMessage,
  WhatsAppMessage,
  WhatsAppTemplate,
} from "../types";

export class MessageAdapter {
  toUnified(msg: proto.IWebMessageInfo): UnifiedMessage {
    return {
      id: msg.key?.id ?? "",
      from: msg.key?.remoteJid ?? "",
      timestamp: Number(msg.messageTimestamp ?? 0),
      type: this.detectType(msg),
      content: this.extractContent(msg),
    };
  }

  toBaileys(msg: WhatsAppMessage): Record<string, unknown> {
    switch (msg.type) {
      case "text":
        return { text: msg.content as string };
      case "image":
        return this.mediaWithCaption("image", msg.content as WhatsAppMediaMessage);
      case "video":
        return this.mediaWithCaption("video", msg.content as WhatsAppMediaMessage);
      case "audio":
        return this.mediaNoCaption("audio", msg.content as WhatsAppMediaMessage);
      case "document":
        return this.mediaWithFilename(msg.content as WhatsAppMediaMessage);
      case "template":
        return { text: this.renderTemplate(msg.content as WhatsAppTemplate) };
      default:
        throw new Error(`Message type ${msg.type} is not yet supported for Baileys`);
    }
  }

  private mediaWithCaption(
    key: "image" | "video",
    media: WhatsAppMediaMessage
  ): Record<string, unknown> {
    if (!media?.link) {
      throw new Error(`${key} message requires a media link`);
    }
    return {
      [key]: { url: media.link },
      ...(media.caption ? { caption: media.caption } : {}),
    };
  }

  private mediaNoCaption(
    key: "audio",
    media: WhatsAppMediaMessage
  ): Record<string, unknown> {
    if (!media?.link) {
      throw new Error(`${key} message requires a media link`);
    }
    return { [key]: { url: media.link } };
  }

  private mediaWithFilename(media: WhatsAppMediaMessage): Record<string, unknown> {
    if (!media?.link) {
      throw new Error("document message requires a media link");
    }
    return {
      document: { url: media.link },
      ...(media.filename ? { fileName: media.filename } : {}),
      ...(media.caption ? { caption: media.caption } : {}),
    };
  }

  private detectType(
    msg: proto.IWebMessageInfo
  ): "text" | "image" | "audio" | "video" | "document" {
    if (msg.message?.conversation || msg.message?.extendedTextMessage) {
      return "text";
    }
    if (msg.message?.imageMessage) {
      return "image";
    }
    if (msg.message?.audioMessage) {
      return "audio";
    }
    if (msg.message?.videoMessage) {
      return "video";
    }
    if (msg.message?.documentMessage) {
      return "document";
    }
    return "text";
  }

  private extractContent(msg: proto.IWebMessageInfo): string {
    return msg.message?.conversation ?? msg.message?.extendedTextMessage?.text ?? "";
  }

  private renderTemplate(template: WhatsAppTemplate): string {
    const params = template.components?.flatMap((component) =>
      component.parameters.map((parameter) => parameter.text).filter(Boolean)
    );
    return params && params.length > 0
      ? `${template.name}: ${params.join(", ")}`
      : template.name;
  }
}
