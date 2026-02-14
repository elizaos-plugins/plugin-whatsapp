import { EventEmitter } from 'events';
import type { WhatsAppMessage, ConnectionStatus } from '../types';

export interface IWhatsAppClient extends EventEmitter {
  // Lifecycle
  start(): Promise<void>;
  stop(): Promise<void>;

  // Messaging
  sendMessage(message: WhatsAppMessage): Promise<any>;

  // Webhooks (Cloud API only - optional for Baileys)
  verifyWebhook?(token: string): Promise<boolean>;

  // Status
  getConnectionStatus(): ConnectionStatus;
}
