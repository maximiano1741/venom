<p align="center">
  <img src="https://github.com/orkestral/venom/raw/main/img/venom.png" alt="Venom" width="220" />
</p>

<h1 align="center">Venom</h1>

<p align="center">
  <em>The next generation of WhatsApp automation.</em>
</p>

<p align="center">
  <img src="https://img.shields.io/npm/v/venom-bot?style=flat-square&color=0d1117&labelColor=0d1117" alt="npm" />
  <img src="https://img.shields.io/node/v/venom-bot?style=flat-square&color=0d1117&labelColor=0d1117" alt="node" />
  <img src="https://img.shields.io/npm/dt/venom-bot?style=flat-square&color=0d1117&labelColor=0d1117" alt="downloads" />
  <img src="https://img.shields.io/github/actions/workflow/status/orkestral/venom/build.yml?branch=master&style=flat-square&color=0d1117&labelColor=0d1117" alt="build" />
  <img src="https://img.shields.io/github/license/orkestral/venom?style=flat-square&color=0d1117&labelColor=0d1117" alt="license" />
</p>

<p align="center">
  <a href="https://orkestral.github.io/venom"><img src="https://img.shields.io/badge/Documentation-Read%20Now-2ea44f?style=for-the-badge&logo=gitbook&logoColor=white" /></a>
  <a href="https://www.npmjs.com/package/venom-bot"><img src="https://img.shields.io/badge/npm-Install-0d1117?style=for-the-badge&logo=npm&logoColor=white" /></a>
</p>

---

<p align="center">
  <img src="https://capsule-render.vercel.app/api?type=rect&color=0:1a1a2e,50:16213e,100:0f3460&height=2&section=header" width="100%" />
</p>

## Why Venom?

Venom is not just another library. It's a **complete automation platform** designed from the ground up for performance, reliability, and developer experience.

Built on top of proven technologies, Venom gives you full control over WhatsApp Web through a clean, intuitive API — whether you're building a simple chatbot or a large-scale enterprise solution.

```
⚡  Blazing fast message processing
🔒  Session persistence out of the box
🧩  Modular architecture — extend with ease
🌐  Multi-session support for scaling
🛡️  Battle-tested in production by thousands of developers
```

---

## Install

One command. That's all you need.

```bash
npm install venom-bot
```

<details>
<summary>🧪 Nightly builds</summary>

```bash
npm install https://github.com/orkestral/venom/releases/download/nightly/venom-bot-nightly.tgz
```
</details>

<details>
<summary>📦 Install from source</summary>

```bash
npm install github:orkestral/venom
```
</details>

---

## Quick Start

Get a fully functional bot running in under 30 seconds.

```javascript
import { create } from 'venom-bot';

create({ session: 'venom-bot' }).then((client) => {

  client.onMessage(async (message) => {
    if (message.body === 'hello') {
      await client.sendText(message.from, 'Hey there! 👋 I\'m running on Venom.');
    }
  });

});
```

Scan the QR code that appears in your terminal. Done — you're live.

> [!TIP]
> Sessions are saved automatically. No need to re-scan on every restart.

---

## Capabilities

### Messaging

Send anything. Text, images, videos, documents, audio, stickers, locations, polls — you name it.

```javascript
// Text
await client.sendText(chatId, 'Hello from Venom 🕷️');

// Image with caption
await client.sendImage(chatId, './photo.jpg', 'photo', 'Check this out!');

// Image from base64
await client.sendImageFromBase64(chatId, base64Image, 'image');

// Document
await client.sendFile(chatId, './report.pdf', 'report.pdf', 'Monthly report');

// Document from base64
await client.sendFileFromBase64(chatId, base64File, 'file.pdf', 'Description');

// Audio
await client.sendVoice(chatId, './message.mp3');

// Sticker
await client.sendImageAsSticker(chatId, './sticker.png');

// Animated sticker
await client.sendImageAsStickerGif(chatId, './animation.gif');

// Location
await client.sendLocation(chatId, '-23.5505', '-46.6333', 'São Paulo, Brazil');

// Link with auto-preview
await client.sendLinkPreview(chatId, 'https://github.com/orkestral/venom', 'Venom Bot');

// Contact card
await client.sendContactVcard(chatId, 'contact@c.us', 'John Doe');

// Multiple contact cards
await client.sendContactVcardList(chatId, ['user1@c.us', 'user2@c.us']);

// Poll
await client.sendPollCreation(chatId, {
  name: 'Best framework?',
  options: [{ name: 'Venom' }, { name: 'Others' }],
  selectableOptionsCount: 1
});

// List menu
await client.sendListMenu(chatId, 'Menu', 'Subtitle', 'Choose an option', 'Select', [
  {
    title: 'Category A',
    rows: [{ title: 'Option 1', description: 'First option' }]
  }
]);
```

### Smart Sending

```javascript
// Send with typing indicator
await client.sendTextViaTyping(chatId, 'This feels more natural...');

// Send photo/video with typing simulation
await client.sendPhotoVideoViaTyping(chatId, './sunset.jpg', 'Beautiful sunset');

// Reply to a message
await client.reply(chatId, 'Got it!', originalMessageId);

// Forward messages
await client.forwardMessages(chatId, [messageId1, messageId2]);

// Mention users
await client.sendMentioned(chatId, 'Hey @5511999999999!', ['5511999999999']);
```

### Data Retrieval

```javascript
const chats    = await client.getAllChats();
const contacts = await client.getAllContacts();
const unread   = await client.getUnreadMessages();
const messages = await client.getAllMessagesInChat(chatId);
const profile  = await client.getProfilePicFromServer(chatId);
const status   = await client.checkNumberStatus(chatId);
const blocked  = await client.getBlockList();
```

### Group Management

```javascript
// Create a group
await client.createGroup('Team Chat', ['user1@c.us', 'user2@c.us']);

// Manage participants
await client.addParticipant(groupId, 'user@c.us');
await client.removeParticipant(groupId, 'user@c.us');

// Admin controls
await client.promoteParticipant(groupId, 'user@c.us');
await client.demoteParticipant(groupId, 'user@c.us');

// Group info
await client.getGroupMembers(groupId);
await client.getGroupAdmins(groupId);
await client.getGroupInviteLink(groupId);
await client.setGroupDescription(groupId, 'Our awesome group');

// Join via invite
await client.joinGroup(inviteCode);

// Leave
await client.leaveGroup(groupId);
```

### Profile & Device

```javascript
await client.setProfileStatus('Building something amazing 🚀');
await client.setProfileName('Venom Bot');
await client.setProfilePic('./avatar.jpg');
await client.getHostDevice();
await client.getConnectionState();
await client.getBatteryLevel();
await client.isConnected();
await client.getWAVersion();
```

### Chat Operations

```javascript
await client.sendSeen(chatId);
await client.startTyping(chatId);
await client.deleteChat(chatId);
await client.clearChatMessages(chatId);
await client.archiveChat(chatId, true);
await client.pinChat(chatId, true);
await client.blockContact(chatId);
await client.unblockContact(chatId);
await client.sendMute(chatId, 30, 'minutes');
```

---

## Events

Build reactive bots with powerful event listeners.

```javascript
// Incoming messages
client.onMessage((msg) => { /* handle message */ });
client.onAnyMessage((msg) => { /* all messages including groups */ });

// Message status tracking
client.onAck((ack) => {
  // -7 MD_DOWNGRADE | -6 INACTIVE | -5 CONTENT_UNUPLOADABLE
  // -4 CONTENT_TOO_BIG | -3 CONTENT_GONE | -2 EXPIRED | -1 FAILED
  //  0 CLOCK | 1 SENT | 2 RECEIVED | 3 READ | 4 PLAYED
});

// Connection state
client.onStateChange((state) => {
  // CONFLICT | CONNECTED | DEPRECATED_VERSION | OPENING | PAIRING
  // PROXYBLOCK | TIMEOUT | TOS_BLOCK | UNLAUNCHED | UNPAIRED
});

// Live location
client.onLiveLocation(chatId, (location) => { /* track location */ });

// Group participants
client.onParticipantsChanged(groupId, (event) => { /* member joined/left */ });

// Added to group
client.onAddedToGroup((chat) => { /* handle new group */ });

// Incoming calls
client.onIncomingCall(async (call) => {
  await client.sendText(call.peerJid, "I'm a bot, can't take calls 📞");
});
```

---

## File Downloads

Download any media received — images, videos, audio, documents. Fast.

```javascript
import * as fs from 'fs';
import * as mime from 'mime-types';

client.onMessage(async (message) => {
  if (message.isMedia || message.isMMS) {
    const buffer = await client.decryptFile(message);
    const fileName = `file.${mime.extension(message.mimetype)}`;
    fs.writeFileSync(fileName, buffer);
  }
});
```

---

## Advanced Configuration

Full control over every aspect of the browser and session.

```javascript
create({
  session: 'production',

  catchQR: (base64Qr, asciiQR, attempts, urlCode) => {
    console.log(`Scan attempt ${attempts}`);
  },

  statusFind: (status, session) => {
    console.log(`[${session}] Status: ${status}`);
  },

  options: {
    // Browser
    headless: 'new',
    devtools: false,
    browserWS: '',
    browserPathExecutable: '',
    puppeteerOptions: {},
    browserArgs: [''],
    addBrowserArgs: [''],

    // Session
    folderNameToken: 'tokens',
    mkdirFolderToken: '',
    createPathFileToken: false,

    // Logging
    debug: false,
    logQR: true,
    updatesLog: true,
    disableSpins: false,
    disableWelcome: false,

    // Connection
    autoClose: 60000,
    addProxy: [''],
    userProxy: '',
    userPass: ''
  },

  browserInstance: (browser, waPage) => {
    console.log('Browser PID:', browser.process().pid);
  }
});
```

<details>
<summary>📋 Session Status Reference</summary>

| Status | Description |
|---|---|
| `isLogged` | Already authenticated |
| `notLogged` | Awaiting QR scan |
| `browserClose` | Browser closed |
| `qrReadSuccess` | QR scanned successfully |
| `qrReadFail` | QR scan failed |
| `autocloseCalled` | Auto-close triggered |
| `desconnectedMobile` | Phone disconnected |
| `serverClose` | WebSocket closed |
| `chatsAvailable` | Chat list loaded |
| `deviceNotConnected` | Phone not connected |
| `successChat` | Chat ready |
| `waitForLogin` | Waiting for login |
| `waitChat` | Loading chats |
</details>

---

## Session Resilience

Keep your bot running and handle disconnections gracefully.

```javascript
client.onStateChange((state) => {
  if (state === 'CONFLICT') client.useHere();   // reclaim session
  if (state === 'UNPAIRED') console.log('Session expired');
});

// Graceful shutdown
process.on('SIGINT', () => client.close());
```

> [!NOTE]
> Always call `client.close()` instead of killing the process — this ensures the session is saved properly.

---

## Custom WhatsApp Web Version

```javascript
create({
  session: 'custom-version',
  webVersion: '2.2402.5'  // pinned version
});
```

Available versions: [wppconnect-team/wa-version](https://github.com/wppconnect-team/wa-version/tree/main/html)

---

## Building from Source

```bash
# Clone
git clone https://github.com/orkestral/venom.git && cd venom

# Install dependencies
npm install

# Build individual modules
npm run build:wapi
npm run build:middleware
npm run build:jsQR
npm run build:venom

# Or build everything at once
npm run build
```

---

## Documentation

The complete documentation is available at [orkestral.github.io/venom](https://orkestral.github.io/venom).

Every method, every parameter, every edge case — fully documented.

---

## Contributing

We love contributions. Open an issue, submit a PR, or help improve the docs.

For major changes, please open an issue first to discuss the approach.

---

<p align="center">
  <img src="https://capsule-render.vercel.app/api?type=rect&color=0:0f3460,50:16213e,100:1a1a2e&height=2&section=footer" width="100%" />
</p>

<p align="center">
  <strong>Orkestral</strong> — by <em>vynect</em><br>
  <sub>Silicon Valley, California</sub>
</p>
