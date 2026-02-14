# @elizaos/plugin-whatsapp

WhatsApp integration plugin for ElizaOS supporting **both** Cloud API and Baileys (QR code) authentication methods.

## Overview

This plugin provides two ways to connect to WhatsApp:

1. **Baileys** - Personal WhatsApp via QR code (recommended for getting started)
2. **Cloud API** - Official Meta Business API (recommended for production)

Both methods support:
- Sending text and template messages
- Receiving messages (Baileys: real-time, Cloud API: webhooks)
- Message status tracking
- Session management

## Installation

```bash
npm install @elizaos/plugin-whatsapp
```

## Quick Start

### Option 1: Baileys (QR Code) - Easiest Setup

```typescript
import { WhatsAppPlugin } from '@elizaos/plugin-whatsapp';

const plugin = new WhatsAppPlugin({
  authDir: './whatsapp-auth'  // Session storage directory
});

// Listen for QR code
plugin.on('qr', (qrData) => {
  console.log('Scan this QR code with WhatsApp:');
  console.log(qrData.terminal);
});

// Wait for connection
plugin.on('ready', () => {
  console.log('Connected to WhatsApp!');
});

// Start the plugin
await plugin.start();
```

**See [BAILEYS_SETUP.md](./BAILEYS_SETUP.md) for complete Baileys guide.**

### Option 2: Cloud API (Meta Official)

```typescript
import { WhatsAppPlugin } from '@elizaos/plugin-whatsapp';

const plugin = new WhatsAppPlugin({
  accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
  phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
  webhookVerifyToken: process.env.WHATSAPP_WEBHOOK_TOKEN,  // Optional
  apiVersion: 'v17.0'  // Optional, defaults to v17.0
});

await plugin.start();
```

## Configuration

### Baileys Configuration

```typescript
interface BaileysConfig {
  authMethod?: 'baileys';        // Optional: auto-detected
  authDir: string;               // Required: session directory
  sessionPath?: string;          // Optional: alternative path
  printQRInTerminal?: boolean;   // Optional: default true
}
```

**Environment Variables:**
```env
WHATSAPP_AUTH_DIR=./whatsapp-auth
WHATSAPP_PRINT_QR=true
```

### Cloud API Configuration

```typescript
interface CloudAPIConfig {
  authMethod?: 'cloudapi';       // Optional: auto-detected
  accessToken: string;           // Required: Cloud API token
  phoneNumberId: string;         // Required: Phone number ID
  webhookVerifyToken?: string;   // Optional: webhook verification
  businessAccountId?: string;    // Optional: business account ID
  apiVersion?: string;           // Optional: API version (default: v17.0)
}
```

**Environment Variables:**
```env
WHATSAPP_ACCESS_TOKEN=your_access_token
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
WHATSAPP_WEBHOOK_TOKEN=your_webhook_token
WHATSAPP_BUSINESS_ID=your_business_id
```

### Auto-Detection

The plugin automatically detects which authentication method to use:

- If `authDir` is present → Baileys
- If `accessToken` + `phoneNumberId` → Cloud API
- Explicitly set with `authMethod` property

## Sending Messages

Both methods use the same API:

```typescript
// Send text message
await plugin.sendMessage({
  type: 'text',
  to: '1234567890@s.whatsapp.net',  // For Baileys
  // OR
  to: '1234567890',  // For Cloud API
  content: 'Hello from WhatsApp Plugin!'
});

// Send template message (Cloud API only)
await plugin.sendMessage({
  type: 'template',
  to: '1234567890',
  content: {
    name: 'hello_world',
    language: {
      code: 'en'
    }
  }
});
```

## Receiving Messages

### Baileys (Real-time Events)

```typescript
plugin.on('message', (msg) => {
  console.log('From:', msg.from);
  console.log('Content:', msg.content);
  console.log('Type:', msg.type);
  console.log('Timestamp:', msg.timestamp);
});
```

### Cloud API (Webhooks)

```typescript
// Handle webhook events
app.post('/webhook', async (req, res) => {
  await plugin.handleWebhook(req.body);
  res.sendStatus(200);
});

// Verify webhook
app.get('/webhook', async (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token && await plugin.verifyWebhook(token)) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});
```

## Events

```typescript
// QR Code (Baileys only)
plugin.on('qr', (qrData) => {
  console.log(qrData.terminal);  // Terminal display
  console.log(qrData.dataURL);   // Data URL for <img>
  console.log(qrData.raw);       // Raw QR string
});

// Connection Status
plugin.on('connection', (status) => {
  // status: 'connecting' | 'open' | 'close'
});

// Ready (connected)
plugin.on('ready', () => {
  console.log('WhatsApp is ready!');
});

// Messages (Baileys only)
plugin.on('message', (msg) => {
  console.log('Received message:', msg);
});
```

## API Reference

### WhatsAppPlugin

```typescript
class WhatsAppPlugin extends EventEmitter {
  constructor(config: WhatsAppConfig)

  // Lifecycle
  start(): Promise<void>
  stop(): Promise<void>

  // Messaging
  sendMessage(message: WhatsAppMessage): Promise<any>

  // Webhooks (Cloud API only)
  handleWebhook(event: WhatsAppWebhookEvent): Promise<void>
  verifyWebhook(token: string): Promise<boolean>

  // Status
  getConnectionStatus(): ConnectionStatus
}
```

### Message Formats

```typescript
interface WhatsAppMessage {
  type: 'text' | 'template';
  to: string;
  content: string | WhatsAppTemplate;
}

interface UnifiedMessage {
  id: string;
  from: string;
  timestamp: number;
  type: 'text' | 'image' | 'audio' | 'video' | 'document';
  content: string;
}

interface WhatsAppTemplate {
  name: string;
  language: {
    code: string;
  };
  components?: Array<{
    type: string;
    parameters: Array<{
      type: string;
      text?: string;
    }>;
  }>;
}
```

## Examples

### Echo Bot (Baileys)

```typescript
const plugin = new WhatsAppPlugin({
  authDir: './auth'
});

plugin.on('qr', (qr) => console.log(qr.terminal));

plugin.on('message', async (msg) => {
  await plugin.sendMessage({
    type: 'text',
    to: msg.from,
    content: `Echo: ${msg.content}`
  });
});

await plugin.start();
```

### Cloud API Message

```typescript
const plugin = new WhatsAppPlugin({
  accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
  phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID
});

await plugin.start();

await plugin.sendMessage({
  type: 'text',
  to: '1234567890',
  content: 'Hello from Cloud API!'
});
```

## Comparison: Baileys vs Cloud API

| Feature | Baileys | Cloud API |
|---------|---------|-----------|
| Setup Complexity | Simple (QR code) | Complex (Meta account) |
| Cost | Free | Free tier + API costs |
| Phone Requirement | Online initially | Not required |
| Official Support | No (reverse-engineered) | Yes (Meta official) |
| Real-time Events | Yes (WebSocket) | No (webhooks) |
| Account Type | Personal | Business |
| Rate Limits | Informal | Documented |
| Best For | Personal, testing, dev | Production, business, high volume |

## Error Handling

```typescript
try {
  await plugin.sendMessage({
    type: 'text',
    to: '1234567890',
    content: 'Hello!',
  });
} catch (error) {
  console.error('Failed to send message:', error.message);
}
```

Common errors:
- Invalid configuration
- Failed message sending
- Webhook verification failure
- Invalid webhook payload
- Connection failures (Baileys)
- Session expired (Baileys)

## Troubleshooting

### Baileys

- **QR not showing**: Check `printQRInTerminal` setting or use `qr` event
- **Connection closes**: Normal after QR scan, waits for reconnection
- **Session expired**: Delete `authDir` folder and re-authenticate

### Cloud API

- **401 Unauthorized**: Check `accessToken` validity
- **Invalid phone number**: Verify `phoneNumberId`
- **Webhook not working**: Ensure `webhookVerifyToken` matches

See [BAILEYS_SETUP.md](./BAILEYS_SETUP.md) for detailed troubleshooting.

## Security Best Practices

### General
- Store credentials securely using environment variables
- Validate all phone numbers before sending messages
- Implement proper error handling
- Keep dependencies updated
- Monitor API usage and rate limits

### Baileys-Specific
- Keep `authDir` secure and private
- Don't commit session data to version control
- Use a dedicated phone number for bots
- Respect rate limits to avoid bans

### Cloud API-Specific
- Never expose `accessToken` in client-side code
- Use HTTPS for all API communication
- Implement webhook retry mechanisms
- Set up proper webhook verification

## Development

### Building

```bash
npm run build
```

### Testing

```bash
npm run test
```

### Linting

```bash
npm run lint
```

## Resources

- [Baileys GitHub](https://github.com/WhiskeySockets/Baileys)
- [Baileys Documentation](https://baileys.wiki/)
- [WhatsApp Cloud API Docs](https://developers.facebook.com/docs/whatsapp/cloud-api)
- [Plugin Source Code](https://github.com/elizaos-plugins/plugin-whatsapp)
- [ElizaOS](https://github.com/elizaos/eliza)

## Credits

This plugin integrates with:
- [WhatsApp Cloud API](https://developers.facebook.com/docs/whatsapp/cloud-api) - Meta's official WhatsApp Business Platform
- [Baileys](https://github.com/WhiskeySockets/Baileys) - Lightweight WhatsApp Web API
- [Axios](https://axios-http.com/) - HTTP client for Cloud API
- [QRCode](https://github.com/soldair/node-qrcode) - QR code generation

Special thanks to the Eliza community for their contributions and feedback.

## Contributing

Contributions are welcome! Please see the repository for contributing guidelines.

## License

This plugin is part of the Eliza project. See the main project repository for license information.
