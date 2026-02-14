import type { proto } from '@whiskeysockets/baileys';
import type { UnifiedMessage, WhatsAppMessage } from '../types';

export class MessageAdapter {
  // Convert Baileys message to unified format
  toUnified(msg: proto.IWebMessageInfo): UnifiedMessage {
    return {
      id: msg.key?.id ?? '',
      from: msg.key?.remoteJid ?? '',
      timestamp: Number(msg.messageTimestamp ?? 0),
      type: this.detectType(msg),
      content: this.extractContent(msg)
    };
  }

  // Convert unified message to Baileys format
  toBaileys(msg: WhatsAppMessage) {
    if (msg.type === 'text') {
      return { text: msg.content as string };
    }
    // Add more types as needed
    throw new Error(`Message type ${msg.type} not yet supported for Baileys`);
  }

  private detectType(msg: proto.IWebMessageInfo): 'text' | 'image' | 'audio' | 'video' | 'document' {
    if (msg.message?.conversation) return 'text';
    if (msg.message?.extendedTextMessage) return 'text';
    if (msg.message?.imageMessage) return 'image';
    if (msg.message?.audioMessage) return 'audio';
    if (msg.message?.videoMessage) return 'video';
    if (msg.message?.documentMessage) return 'document';
    return 'text';
  }

  private extractContent(msg: proto.IWebMessageInfo): string {
    return msg.message?.conversation ||
           msg.message?.extendedTextMessage?.text ||
           '';
  }
}
