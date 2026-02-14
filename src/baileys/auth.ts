import { useMultiFileAuthState } from '@whiskeysockets/baileys';
import type { AuthenticationState } from '@whiskeysockets/baileys';

export class BaileysAuthManager {
  private authDir: string;
  private state?: AuthenticationState;
  private saveCreds?: () => Promise<void>;

  constructor(authDir: string) {
    this.authDir = authDir;
  }

  async initialize() {
    const result = await useMultiFileAuthState(this.authDir);
    this.state = result.state;
    this.saveCreds = result.saveCreds;
    return this.state;
  }

  async save() {
    if (this.saveCreds) {
      await this.saveCreds();
    }
  }

  getState() {
    return this.state;
  }
}
