import makeWASocket, { DisconnectReason, WASocket } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import { EventEmitter } from 'events';
import type { BaileysAuthManager } from './auth';
import type { ConnectionStatus } from '../types';

export class BaileysConnection extends EventEmitter {
  private socket?: WASocket;
  private authManager: BaileysAuthManager;
  private connectionStatus: ConnectionStatus = 'close';
  private reconnecting = false;
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 10;

  constructor(authManager: BaileysAuthManager) {
    super();
    this.authManager = authManager;
  }

  async connect() {
    const state = await this.authManager.initialize();

    // Remove listeners from previous socket to prevent stale handlers
    if (this.socket?.ev) {
      this.socket.ev.removeAllListeners('connection.update');
      this.socket.ev.removeAllListeners('creds.update');
      this.socket.ev.removeAllListeners('messages.upsert');
    }

    this.socket = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: 'silent' }),
      browser: ['Chrome (Linux)', '', ''],
    });

    this.setupEventHandlers();
    return this.socket;
  }

  private setupEventHandlers() {
    if (!this.socket) return;

    // QR Code & Connection
    this.socket.ev.on('connection.update', async (update) => {
      const { connection, qr, lastDisconnect } = update;

      if (qr) {
        this.emit('qr', qr);
      }

      if (connection) {
        this.connectionStatus = connection;
        this.emit('connection', connection);
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;

        // Handle specific error codes
        if (statusCode === 405) {
          console.error('WhatsApp rejected the connection (405). This usually means:');
          console.error('  - Baileys version is outdated');
          console.error('  - WhatsApp protocol has changed');
          console.error('  - Browser info is rejected by WhatsApp');
          this.emit('error', new Error('WhatsApp connection rejected (405). Try updating @whiskeysockets/baileys'));
          return; // Don't reconnect on 405
        }

        // 515 = QR code timeout, this is expected
        const isQRTimeout = statusCode === 515;
        if (isQRTimeout) {
          console.log('QR code timed out, generating new one...');
        }

        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        // Only emit error for unexpected errors (not QR timeout)
        if (lastDisconnect?.error && !isQRTimeout) {
          console.error('Connection error:', lastDisconnect.error.message || lastDisconnect.error);
        }

        if (shouldReconnect && statusCode !== 405) {
          // Prevent concurrent reconnection attempts
          if (this.reconnecting) {
            return;
          }

          // Check if max attempts reached
          if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
            console.error(`Max reconnection attempts (${this.MAX_RECONNECT_ATTEMPTS}) reached. Giving up.`);
            this.emit('error', new Error('Max reconnection attempts reached'));
            return;
          }

          this.reconnecting = true;
          try {
            this.reconnectAttempts++;

            // Exponential backoff: 1s, 2s, 4s, 8s, etc., capped at 30s
            const baseDelay = isQRTimeout ? 1000 : 3000;
            const exponentialDelay = Math.min(baseDelay * Math.pow(2, this.reconnectAttempts - 1), 30000);

            console.log(`Reconnecting in ${exponentialDelay/1000} seconds... (attempt ${this.reconnectAttempts}/${this.MAX_RECONNECT_ATTEMPTS})`);

            await new Promise(resolve => setTimeout(resolve, exponentialDelay));
            await this.connect();
          } catch (err) {
            console.error('Reconnection failed:', err);
            this.emit('error', err);
          } finally {
            this.reconnecting = false;
          }
        }
      }

      // Reset reconnect counter on successful connection
      if (connection === 'open') {
        this.reconnectAttempts = 0;
      }
    });

    // Save credentials
    this.socket.ev.on('creds.update', async () => {
      await this.authManager.save();
    });

    // Messages
    this.socket.ev.on('messages.upsert', ({ messages }) => {
      this.emit('messages', messages);
    });
  }

  getSocket() {
    return this.socket;
  }

  getStatus() {
    return this.connectionStatus;
  }

  async disconnect() {
    if (this.socket) {
      // Remove all event listeners from the Baileys event emitter
      this.socket.ev.removeAllListeners('connection.update');
      this.socket.ev.removeAllListeners('creds.update');
      this.socket.ev.removeAllListeners('messages.upsert');

      // Close the WebSocket connection (preserves session for next connection)
      if (this.socket.ws) {
        this.socket.ws.close();
      }

      this.socket = undefined;
      this.connectionStatus = 'close';

      // Emit connection event for consistency
      this.emit('connection', 'close');
    }
  }
}
