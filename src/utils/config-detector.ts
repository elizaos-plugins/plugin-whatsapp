import type { WhatsAppConfig } from '../types';

export function detectAuthMethod(config: any): 'baileys' | 'cloudapi' {
  // Explicit method specified
  if (config.authMethod) {
    if (config.authMethod !== 'baileys' && config.authMethod !== 'cloudapi') {
      throw new Error(
        `Invalid authMethod: "${config.authMethod}". Must be either "baileys" or "cloudapi".`
      );
    }
    return config.authMethod;
  }

  // Auto-detect from fields
  if (config.authDir || config.sessionPath || config.authState) {
    return 'baileys';
  }

  if (config.accessToken && config.phoneNumberId) {
    return 'cloudapi';
  }

  throw new Error(
    'Cannot detect auth method. Provide either:\n' +
    '  - authDir (for Baileys QR code)\n' +
    '  - accessToken + phoneNumberId (for Cloud API)'
  );
}
