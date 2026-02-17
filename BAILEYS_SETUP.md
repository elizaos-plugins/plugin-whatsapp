# Baileys Setup Guide

This guide explains how to use the WhatsApp plugin with **Baileys** authentication (QR code).

## What is Baileys?

[Baileys](https://github.com/WhiskeySockets/Baileys) is a lightweight, full-featured WhatsApp Web API library that connects to WhatsApp using the same protocol as WhatsApp Web. It's a reverse-engineered implementation that doesn't require a business account.

## Quick Start

### 1. Install the Plugin

```bash
npm install @elizaos/plugin-whatsapp
```

### 2. Configure with Baileys

```typescript
import { WhatsAppPlugin } from '@elizaos/plugin-whatsapp';

const plugin = new WhatsAppPlugin({
  authDir: './whatsapp-auth',  // Directory to store session
  printQRInTerminal: true      // Optional: print QR in terminal
});
```

### 3. Start and Scan QR Code

```typescript
plugin.on('qr', (qrData) => {
  console.log('Scan this QR code with WhatsApp:');
  console.log(qrData.terminal);

  // Or display in web UI:
  // <img src={qrData.dataURL} />
});

plugin.on('ready', () => {
  console.log('Connected to WhatsApp!');
});

await plugin.start();
```

### 4. Send and Receive Messages

```typescript
// Send a message
await plugin.sendMessage({
  type: 'text',
  to: '1234567890@s.whatsapp.net',  // Phone number + @s.whatsapp.net
  content: 'Hello from Baileys!'
});

// Receive messages
plugin.on('message', (msg) => {
  console.log('Received:', msg.content);
  console.log('From:', msg.from);
});
```

## Session Persistence

Baileys stores authentication credentials in the `authDir` folder:

```text
whatsapp-auth/
  ├── creds.json          # Authentication credentials
  └── keys/               # Encryption keys
      ├── pre-keys/
      ├── sender-keys/
      └── app-state-sync-keys/
```

**Important:**
- Keep this folder secure - it contains your WhatsApp session
- Don't commit it to version control
- Back it up if you want to preserve the session

### Reconnection

On subsequent starts, Baileys will use the saved session:

```typescript
// First run: Shows QR code
await plugin.start();

// Next runs: Connects automatically (no QR code)
await plugin.start();
```

## Configuration Options

### BaileysConfig Interface

```typescript
interface BaileysConfig {
  authMethod?: 'baileys';           // Optional: explicit method
  authDir: string;                  // Required: session directory
  sessionPath?: string;             // Optional: alternative session path
  printQRInTerminal?: boolean;      // Optional: print QR (default: true)
}
```

### Example Configurations

**Basic (QR in terminal)**
```typescript
{
  authDir: './whatsapp-session'
}
```

**Disable QR in terminal**
```typescript
{
  authDir: './whatsapp-session',
  printQRInTerminal: false
}
```

**Explicit method**
```typescript
{
  authMethod: 'baileys',
  authDir: './auth/whatsapp'
}
```

## Events

The plugin emits several events:

```typescript
// QR Code generated
plugin.on('qr', (qrData) => {
  console.log(qrData.terminal);  // Terminal string
  console.log(qrData.dataURL);   // Data URL for <img>
  console.log(qrData.raw);       // Raw QR string
});

// Connection status changed
plugin.on('connection', (status) => {
  // status: 'connecting' | 'open' | 'close'
  console.log('Connection:', status);
});

// Successfully connected
plugin.on('ready', () => {
  console.log('WhatsApp is ready!');
});

// Message received
plugin.on('message', (msg) => {
  console.log('Message from:', msg.from);
  console.log('Content:', msg.content);
  console.log('Type:', msg.type);  // 'text', 'image', 'audio', etc.
});
```

## WhatsApp ID Format

### Individual Chats
```typescript
'1234567890@s.whatsapp.net'  // Phone number + @s.whatsapp.net
```

### Group Chats
```typescript
'120363XXXXXXXXX@g.us'  // Group ID + @g.us
```

### Getting IDs

```typescript
plugin.on('message', (msg) => {
  console.log('Sender ID:', msg.from);  // Use this for replies
});
```

## Multi-Device Support

Baileys works with WhatsApp's multi-device feature:
- Your phone can be offline
- Sessions work like WhatsApp Web
- Up to 4 linked devices allowed

## Troubleshooting

### QR Code Not Displaying

**Problem:** No QR code shown in terminal

**Solution:**
```typescript
import fs from 'fs';

plugin.on('qr', (qrData) => {
  if (!qrData.terminal) {
    // Fallback: save as image
    const buffer = Buffer.from(qrData.dataURL.split(',')[1], 'base64');
    fs.writeFileSync('qr.png', buffer);
    console.log('QR code saved to qr.png');
  }
});
```

### Connection Closed After QR Scan

**Problem:** Connection closes immediately after scanning

**This is normal!** WhatsApp temporarily disconnects to authenticate. Wait a few seconds and it will reconnect automatically.

### Session Expired

**Problem:** `DisconnectReason.loggedOut`

**Solution:**
- Delete the `authDir` folder
- Scan QR code again
- This happens if the session is too old or manually logged out from phone

### Auth State Corruption

**Problem:** Connection fails with auth errors

**Solution:**
```bash
# Delete auth directory and start fresh
rm -rf ./whatsapp-auth
```

## Security Considerations

### ⚠️ Important Warnings

1. **Unofficial Protocol**: Baileys is reverse-engineered, not officially supported by WhatsApp
2. **Account Bans**: WhatsApp may ban accounts using unofficial clients (rare but possible)
3. **Production Use**: Consider using Cloud API for business/production applications
4. **Rate Limits**: Respect WhatsApp's rate limits to avoid bans

### Best Practices

- Use a dedicated phone number for bots
- Don't spam messages
- Respect rate limits
- Keep `authDir` secure and private
- Use Cloud API for commercial/high-volume use

## Comparison: Baileys vs Cloud API

| Feature | Baileys (QR Code) | Cloud API |
|---------|-------------------|-----------|
| **Setup** | Simple - scan QR code | Complex - Meta Business Account |
| **Cost** | Free | Free tier + potential API costs |
| **Phone** | Must be online initially | No phone required |
| **Official** | Unofficial (reverse-engineered) | Official Meta API |
| **Account Type** | Personal WhatsApp | WhatsApp Business |
| **Real-time** | Native WebSocket | Webhooks |
| **Best For** | Personal, testing, development | Production, business, high volume |

## Switching to Cloud API

If you need official support or higher reliability:

```typescript
// Change from Baileys:
{
  authDir: './whatsapp-auth'
}

// To Cloud API:
{
  accessToken: 'EAABsBCS...',
  phoneNumberId: '1234567890'
}
```

See the main README for Cloud API setup instructions.

## Example: Complete Bot

```typescript
import { WhatsAppPlugin } from '@elizaos/plugin-whatsapp';

const plugin = new WhatsAppPlugin({
  authDir: './whatsapp-session'
});

// Handle QR code
plugin.on('qr', (qr) => {
  console.log('📱 Scan QR Code:\n');
  console.log(qr.terminal);
});

// Handle connection
plugin.on('ready', () => {
  console.log('✅ WhatsApp connected!');
});

// Echo bot - reply to all messages
plugin.on('message', async (msg) => {
  if (!msg.content) return;

  console.log(`Message from ${msg.from}: ${msg.content}`);

  await plugin.sendMessage({
    type: 'text',
    to: msg.from,
    content: `Echo: ${msg.content}`
  });
});

// Start the plugin
await plugin.start();

console.log('Bot is running...');
```

## Resources

- [Baileys GitHub](https://github.com/WhiskeySockets/Baileys)
- [Baileys Documentation](https://baileys.wiki/)
- [WhatsApp Multi-Device Protocol](https://github.com/WhiskeySockets/Baileys#connecting)
- [Plugin Source Code](https://github.com/elizaos-plugins/plugin-whatsapp)

## Support

- For Baileys-specific issues: [Baileys Issues](https://github.com/WhiskeySockets/Baileys/issues)
- For plugin issues: [Plugin Issues](https://github.com/elizaos-plugins/plugin-whatsapp/issues)
- For Cloud API alternative: See main README.md
