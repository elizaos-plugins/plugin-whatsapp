import type { WhatsAppConfig, BaileysConfig, CloudAPIConfig } from '../types';
import type { IWhatsAppClient } from './interface';
import { BaileysClient } from './baileys-client';
import { CloudAPIClient } from './cloud-api-client';
import { detectAuthMethod } from '../utils/config-detector';

export class ClientFactory {
  static create(config: WhatsAppConfig): IWhatsAppClient {
    const authMethod = detectAuthMethod(config);

    if (authMethod === 'baileys') {
      return new BaileysClient(config as BaileysConfig);
    } else {
      return new CloudAPIClient(config as CloudAPIConfig);
    }
  }
}
