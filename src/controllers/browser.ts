import { Browser, Page } from 'puppeteer';
import * as path from 'path';
import * as fs from 'fs';
import puppeteer, { LaunchOptions } from 'puppeteer';
import { VenomConfig } from '../config';
import { Logger } from '../utils/logger';

/**
 * Launch a Puppeteer browser instance
 */
export async function launchBrowser(config: VenomConfig): Promise<Browser> {
  const log = Logger.get(config.session);

  const args = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--no-first-run',
    '--no-zygote',
    '--disable-gpu',
    '--disable-web-security',
    '--disable-features=IsolateOrigins,site-per-process',
    ...(config.browserArgs || []),
  ];

  if (config.addProxy?.length) {
    args.push(`--proxy-server=${config.addProxy[0]}`);
  }

  const tokenDir = config.tokenDir || path.join(process.cwd(), 'tokens');
  const userDataDir = path.join(tokenDir, config.session);

  // Ensure token directory exists
  if (!fs.existsSync(userDataDir)) {
    fs.mkdirSync(userDataDir, { recursive: true });
  }

  const launchOptions: LaunchOptions = {
    headless: config.headless === 'new' ? true : (config.headless ?? true),
    args,
    userDataDir,
    ...(config.browserWS ? { browserWSEndpoint: config.browserWS } : {}),
    ...getBrowserExecutable(config),
    ...(config.puppeteerOptions || {}),
  };

  log.info('Launching browser...');

  const browser = await puppeteer.launch(launchOptions);

  log.info('Browser launched successfully');

  return browser;
}

/**
 * Get browser executable path and/or channel based on config
 */
function getBrowserExecutable(config: VenomConfig): Partial<LaunchOptions> {
  // 1. User specified path (highest priority)
  if (config.browserPathExecutable) {
    return { executablePath: config.browserPathExecutable };
  }

  const browserType = config.browser || 'chromium';

  // 2. Use built-in Puppeteer channel for Chrome variants
  if (browserType === 'chrome') {
    return { channel: 'chrome' };
  }

  // 3. Edge and Firefox need explicit executable path
  if (browserType === 'edge' || browserType === 'firefox') {
    const browser = findSystemBrowser(browserType);
    if (browser) return { executablePath: browser };
    console.warn(`${browserType} not found on system. Install it or set browserPathExecutable.`);
    return {};
  }

  // 3. Puppeteer's bundled Chromium
  try {
    const pPath = puppeteer.executablePath();
    if (pPath && fs.existsSync(pPath)) return { executablePath: pPath };
  } catch {}

  // 4. Our downloaded Chromium
  const localChrome = path.join(__dirname, '..', '..', '.chromium');
  if (fs.existsSync(localChrome)) {
    const dirs = fs.readdirSync(localChrome);
    for (const dir of dirs) {
      if (dir.startsWith('chrome-') || dir.startsWith('chromium-')) {
        const chromePath = path.join(localChrome, dir, 'chrome');
        if (fs.existsSync(chromePath)) return { executablePath: chromePath };
      }
    }
  }

  // 5. Search system for Edge / Chrome / Chromium by platform
  const systemBrowser = findSystemBrowser(browserType);
  if (systemBrowser) return { executablePath: systemBrowser };

  // 6. Return undefined = let Puppeteer decide
  return {};
}

/**
 * Find a system-installed browser by platform
 */
function findSystemBrowser(type: 'chromium' | 'chrome' | 'edge' | 'firefox'): string | undefined {
  const candidates: Record<string, string[]> = {
    edge: [
      // macOS
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      // Linux
      '/usr/bin/microsoft-edge',
      '/usr/bin/microsoft-edge-stable',
      '/opt/microsoft/msedge/msedge',
      // Windows (forward slashes work in Node on Windows)
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    ],
    chrome: [
      // macOS
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      // Linux
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/opt/google/chrome/chrome',
      // Windows
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    ],
    chromium: [
      // Linux
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/snap/bin/chromium',
    ],
    firefox: [
      '/Applications/Firefox.app/Contents/MacOS/firefox',
      '/usr/bin/firefox',
      'C:\\Program Files\\Mozilla Firefox\\firefox.exe',
    ],
  };

  const paths = candidates[type] || [];
  for (const p of paths) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {}
  }
  return undefined;
}

/**
 * Initialize a WhatsApp Web page
 */
export async function initPage(browser: Browser, config: VenomConfig): Promise<Page> {
  const log = Logger.get(config.session);
  const page = await browser.newPage();

  // Set viewport
  await page.setViewport({ width: 1280, height: 800 });

  // Set user agent
  const ua =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  await page.setUserAgent(ua);

  // Bypass CSP
  await page.setBypassCSP(true);

  // Set extra headers
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'en-US,en;q=0.9',
  });

  log.info('Navigating to WhatsApp Web...');

  await page.goto('https://web.whatsapp.com', {
    waitUntil: 'networkidle2',
    timeout: 60000,
  });

  // Wait a bit for JS to fully initialize
  await new Promise((r) => setTimeout(r, 2000));

  log.info('WhatsApp Web loaded');

  return page;
}

/**
 * Wait for WhatsApp Web to be fully ready
 */
export async function waitForReady(page: Page, timeout = 60000): Promise<boolean> {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    const ready = await page.evaluate(
      'window.Debug?.VERSION != undefined'
    ).catch(() => false);

    if (ready) {
      // Also wait for require to be available
      const hasRequire = await page.evaluate(
        'typeof window.require === "function"'
      ).catch(() => false);
      if (hasRequire) return true;
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  return false;
}

/**
 * Wait for the Socket state to be available (not UNKNOWN)
 */
export async function waitForSocketReady(page: Page, timeout = 30000): Promise<string> {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    const state = await getConnectionState(page);
    // Wait until state is a terminal state (not transitional)
    const terminalStates = ['UNPAIRED', 'UNPAIRED_IDLE', 'CONNECTED', 'CONFLICT', 'TIMEOUT'];
    if (terminalStates.includes(state)) return state;
    await new Promise((r) => setTimeout(r, 500));
  }

  return await getConnectionState(page);
}

/**
 * Get WhatsApp connection state
 */
export async function getConnectionState(page: Page): Promise<string> {
  return page.evaluate(() => {
    try {
      const W = window as any;
      const Socket = W.require?.('WAWebSocketModel')?.Socket;
      return Socket?.state || 'UNKNOWN';
    } catch {
      return 'UNKNOWN';
    }
  }).catch(() => 'UNKNOWN');
}

/**
 * Check if needs authentication (QR scan)
 */
export async function needsAuth(page: Page): Promise<boolean> {
  const state = await getConnectionState(page);
  return state === 'UNPAIRED' || state === 'UNPAIRED_IDLE';
}

/**
 * Get QR code data for authentication
 */
export async function getQRCode(page: Page): Promise<string | null> {
  return page.evaluate(async () => {
    try {
      const W = window as any;
      const Conn = W.require?.('WAWebConnModel')?.Conn;
      const SignalStore = W.require?.('WAWebSignalStoreApi')?.waSignalStore;
      const NoiseInfo = W.require?.('WAWebUserPrefsInfoStore')?.waNoiseInfo;
      const Base64 = W.require?.('WABase64');
      const MultiDevice = W.require?.('WAWebUserPrefsMultiDevice');

      if (!Conn?.ref || !SignalStore || !NoiseInfo || !Base64 || !MultiDevice) {
        return null;
      }

      // These are async!
      const registrationInfo = await SignalStore.getRegistrationInfo();
      const noiseKeyPair = await NoiseInfo.get();

      const staticKeyB64 = Base64.encodeB64(noiseKeyPair.staticKeyPair.pubKey);
      const identityKeyB64 = Base64.encodeB64(registrationInfo.identityKeyPair.pubKey);
      const advSecretKey = MultiDevice.getADVSecretKey();

      // Get platform from WAWebCompanionRegClientUtils
      let platform = '';
      try {
        platform = W.require('WAWebCompanionRegClientUtils')?.DEVICE_PLATFORM || '';
      } catch {}

      return [
        Conn.ref,
        staticKeyB64,
        identityKeyB64,
        advSecretKey,
        platform
      ].join(',');
    } catch {
      return null;
    }
  }).catch(() => null);
}

/**
 * Request a pairing code for phone number authentication
 */
export async function requestPairingCode(page: Page, phoneNumber: string): Promise<string | null> {
  return page.evaluate(async (phone: string) => {
    try {
      const W = window as any;
      const LinkingApi = W.require?.('WAWebAltDeviceLinkingApi');
      if (!LinkingApi) return null;

      const code = await LinkingApi.requestPairingCode?.(phone);
      return code || null;
    } catch {
      return null;
    }
  }, phoneNumber).catch(() => null);
}

/**
 * Inject the WAPI (WhatsApp API) layer into the page
 */
export async function injectWAPI(page: Page): Promise<void> {
  await page.evaluate(() => {
    const W = window as any;

    // Prevent double injection
    if (W.WWebJS) return;

    W.WWebJS = {};

    // ==================== HELPERS ====================

    /**
     * Get a chat by ID (uses WAWebCollections)
     */
    W.WWebJS._getChat = async function (chatId: string) {
      const Chat = W.require?.('WAWebCollections')?.Chat;
      if (!Chat) return null;
      let chat = Chat.get(chatId);
      if (!chat) {
        try {
          chat = await Chat.find(W.require('WAWebWidFactory').createWid(chatId));
        } catch {}
      }
      return chat;
    };

    /**
     * Get a contact by ID
     */
    W.WWebJS._getContact = async function (contactId: string) {
      const Contact = W.require?.('WAWebCollections')?.Contact;
      if (!Contact) return null;
      try {
        return await Contact.find(W.require('WAWebWidFactory').createWid(contactId));
      } catch {
        return null;
      }
    };

    /**
     * Get a message by ID
     */
    W.WWebJS._getMessage = function (msgId: string) {
      const Msg = W.require?.('WAWebCollections')?.Msg;
      return Msg?.get?.(msgId) || null;
    };

    /**
     * Build and send a message using addAndSendMsgToChat
     */
    W.WWebJS._buildAndSend = async function (chat: any, messageData: any) {
      const MsgKey = W.require('WAWebMsgKey');
      const UserPrefs = W.require('WAWebUserPrefsMeUser');
      const EphemeralUtils = W.require('WAWebGetEphemeralFieldsMsgActionsUtils');
      const SendAction = W.require('WAWebSendMsgChatAction');
      const Collections = W.require('WAWebCollections');

      const newId = await MsgKey.newId();
      const meUser = UserPrefs.getMaybeMePnUser();
      const lidUser = UserPrefs.getMaybeMeLidUser();
      const from = chat.id?.isLid?.() ? lidUser : meUser;

      let participant;
      if (typeof chat.id?.isGroup === 'function' && chat.id.isGroup()) {
        const WidFactory = W.require('WAWebWidFactory');
        participant = WidFactory.asUserWidOrThrow?.(from);
      }

      const ephemeralFields = EphemeralUtils?.getEphemeralFields?.(chat) || {};

      const message = {
        id: new (MsgKey)({ from, to: chat.id, id: newId, participant, selfDir: 'out' }),
        ack: 0,
        from,
        to: chat.id,
        local: true,
        self: 'out',
        t: Math.floor(Date.now() / 1000),
        isNewMsg: true,
        ...ephemeralFields,
        ...messageData,
      };

      const [msgPromise] = SendAction.addAndSendMsgToChat(chat, message);
      await msgPromise;

      return Collections.Msg.get(newId._serialized);
    };

    // ==================== SENDING ====================

    /**
     * Send a text message
     */
    W.WWebJS.sendTextMessage = async function (chatId: string, text: string) {
      const chat = await W.WWebJS._getChat(chatId);
      if (!chat) throw new Error('Chat not found: ' + chatId);

      const result = await W.WWebJS._buildAndSend(chat, {
        type: 'chat',
        body: text,
      });
      return result?.serialize?.() || result;
    };

    /**
     * Send a media message (image/video/file)
     */
    W.WWebJS.sendMediaMessage = async function (
      chatId: string,
      base64Data: string,
      mimeType: string,
      filename: string,
      caption?: string
    ) {
      const chat = await W.WWebJS._getChat(chatId);
      if (!chat) throw new Error('Chat not found: ' + chatId);

      const mediaType = mimeType.startsWith('image/')
        ? 'image'
        : mimeType.startsWith('video/')
        ? 'video'
        : mimeType.startsWith('audio/')
        ? 'audio'
        : 'document';

      const result = await W.WWebJS._buildAndSend(chat, {
        type: mediaType,
        body: base64Data,
        mimetype: mimeType,
        filename,
        caption: caption || '',
      });
      return result?.serialize?.() || result;
    };

    /**
     * Send a location
     */
    W.WWebJS.sendLocation = async function (
      chatId: string,
      lat: number,
      lng: number,
      title: string,
      address: string
    ) {
      const chat = await W.WWebJS._getChat(chatId);
      if (!chat) return null;

      const result = await W.WWebJS._buildAndSend(chat, {
        type: 'location',
        loc: title,
        lat,
        lng,
        address,
      });
      return result?.serialize?.() || result;
    };

    /**
     * Send a contact vCard
     */
    W.WWebJS.sendContactVcard = async function (chatId: string, contactId: string, name: string) {
      const chat = await W.WWebJS._getChat(chatId);
      const contact = await W.WWebJS._getContact(contactId);
      if (!chat || !contact) return null;

      const VcardUtils = W.require?.('WAWebFrontendVcardUtils');
      const vcard = VcardUtils?.vcardFromContactModel?.(contact);

      const result = await W.WWebJS._buildAndSend(chat, {
        type: 'vcard',
        body: vcard?.vcard || '',
        vcardFormattedName: name,
      });
      return result?.serialize?.() || result;
    };

    /**
     * Reply to a message
     */
    W.WWebJS.replyMessage = async function (chatId: string, text: string, quotedMsgId: string) {
      const chat = await W.WWebJS._getChat(chatId);
      const quoted = W.WWebJS._getMessage(quotedMsgId);
      if (!chat || !quoted) return null;

      const ReplyUtils = W.require?.('WAWebMsgReply');
      let quotedMsgOptions = {};
      if (ReplyUtils?.canReplyMsg?.(quoted.unsafe?.())) {
        quotedMsgOptions = quoted.msgContextInfo?.(chat) || {};
      }

      const result = await W.WWebJS._buildAndSend(chat, {
        type: 'chat',
        body: text,
        ...quotedMsgOptions,
      });
      return result?.serialize?.() || result;
    };

    // ==================== RETRIEVAL ====================

    /**
     * Get all chats
     */
    W.WWebJS.getAllChats = function () {
      const Chat = W.require?.('WAWebCollections')?.Chat;
      if (!Chat?.getModelsArray) return [];
      const models = Chat.getModelsArray() || [];
      return models.map((c: any) => c.serialize?.() || c);
    };

    /**
     * Get all contacts
     */
    W.WWebJS.getAllContacts = function () {
      const Contact = W.require?.('WAWebCollections')?.Contact;
      if (!Contact?.getModelsArray) return [];
      const models = Contact.getModelsArray() || [];
      return models.map((c: any) => c.serialize?.() || c);
    };

    /**
     * Get messages in a chat
     */
    W.WWebJS.getMessagesInChat = function (chatId: string, count: number) {
      const chat = Chat_get(chatId);
      if (!chat?.msgs) return [];
      const msgs = chat.msgs.getModelsArray?.() || [];
      return msgs.slice(-count).map((m: any) => m.serialize?.() || m);

      function Chat_get(id: string) {
        return W.require?.('WAWebCollections')?.Chat?.get?.(id);
      }
    };

    /**
     * Get group members
     */
    W.WWebJS.getGroupMembers = async function (groupId: string) {
      const GroupMeta = W.require?.('WAWebGroupMetadataCollection')?.GroupMetadataStore;
      const meta = GroupMeta?.get?.(groupId);
      if (!meta?.participants) return [];
      return meta.participants.getModelsArray?.()?.map((p: any) => p.serialize?.() || p) || [];
    };

    /**
     * Check number status
     */
    W.WWebJS.checkNumberStatus = async function (number: string) {
      const WidFactory = W.require?.('WAWebWidFactory');
      const UserQuery = W.require?.('WAWebUserQuery');
      if (!WidFactory || !UserQuery) return null;
      const wid = WidFactory.createWid?.(number);
      if (!wid) return null;
      return UserQuery.queryExists?.(wid) || null;
    };

    /**
     * Get profile picture URL
     */
    W.WWebJS.getProfilePic = async function (chatId: string) {
      const ProfilePic = W.require?.('WAWebProfilePicGetAction');
      const WidFactory = W.require?.('WAWebWidFactory');
      if (!ProfilePic || !WidFactory) return null;
      const wid = WidFactory.createWid?.(chatId);
      if (!wid) return null;
      return ProfilePic.default?.(wid) || null;
    };

    /**
     * Get blocked contacts
     */
    W.WWebJS.getBlockList = function () {
      const BlockStore = W.require?.('WAWebBlockContactAction')?.BlocklistStore;
      if (!BlockStore?.getModelsArray) return [];
      return BlockStore.getModelsArray().map((b: any) => b.serialize?.() || b);
    };

    /**
     * Get connection state
     */
    W.WWebJS.getConnectionState = function () {
      const Socket = W.require?.('WAWebSocketModel')?.Socket;
      return Socket?.state || 'UNKNOWN';
    };

    /**
     * Get host device info
     */
    W.WWebJS.getHostDevice = function () {
      const Conn = W.require?.('WAWebConnModel')?.Conn;
      const UserPrefs = W.require?.('WAWebUserPrefsInfoStore')?.UserPrefs;
      const result: any = Conn?.serialize?.() ? { ...Conn.serialize() } : (Conn ? { ...Conn } : null);
      if (result) {
        // Add common properties for convenience
        if (UserPrefs?.getMaybeMeUser) {
          try {
            const me = UserPrefs.getMaybeMeUser();
            if (me) {
              result.me = me.serialize ? me.serialize() : me;
              result.wid = result.wid || me._serialized || me;
              result.pushname = result.pushname || me.pushname || me.name;
            }
          } catch {}
        }
      }
      return result;
    };

    /**
     * Get WA version
     */
    W.WWebJS.getWAVersion = function () {
      return W.Debug?.VERSION || 'unknown';
    };

    // ==================== ACTIONS ====================

    /**
     * Mark chat as seen
     */
    W.WWebJS.sendSeen = async function (chatId: string) {
      const chat = await W.WWebJS._getChat(chatId);
      if (!chat) return;
      const Stream = W.require?.('WAWebStreamModel')?.Stream;
      const SeenAction = W.require?.('WAWebUpdateUnreadChatAction');
      if (!SeenAction) return;
      Stream?.markAvailable?.();
      await SeenAction.sendSeen?.({ chat, threadId: undefined });
      Stream?.markUnavailable?.();
      return true;
    };

    /**
     * Delete a message
     */
    W.WWebJS.deleteMessage = async function (chatId: string, msgId: string, everyone: boolean) {
      const DeleteAction = W.require?.('WAWebDeleteMessagesAction');
      const chat = await W.WWebJS._getChat(chatId);
      const msg = W.WWebJS._getMessage(msgId);
      if (!chat || !msg || !DeleteAction) return;
      if (everyone) {
        return DeleteAction.revokeMessages?.(chat, [msg]);
      } else {
        return DeleteAction.deleteMessages?.(chat, [msg]);
      }
    };

    /**
     * Block/unblock contact
     */
    W.WWebJS.blockContact = async function (contactId: string, block: boolean) {
      const BlockAction = W.require?.('WAWebBlockContactAction');
      const contact = await W.WWebJS._getContact(contactId);
      if (!contact || !BlockAction) return;
      if (block) return BlockAction.blockContact?.(contact);
      else return BlockAction.unblockContact?.(contact);
    };

    /**
     * Create a group
     */
    W.WWebJS.createGroup = async function (name: string, participants: string[]) {
      const GroupAction = W.require?.('WAWebGroupCreateAction');
      const WidFactory = W.require?.('WAWebWidFactory');
      if (!GroupAction || !WidFactory) return null;
      const wids = participants.map((p) => WidFactory.createWid?.(p)).filter(Boolean);
      return GroupAction.createGroup?.(name, wids) || null;
    };

    /**
     * Add/remove/promote/demote group participants
     */
    W.WWebJS.groupParticipantAction = async function (
      groupId: string,
      action: string,
      participantIds: string[]
    ) {
      const GroupAction = W.require?.('WAWebGroupParticipantAction');
      const WidFactory = W.require?.('WAWebWidFactory');
      if (!GroupAction || !WidFactory) return;
      const wids = participantIds.map((p) => WidFactory.createWid?.(p)).filter(Boolean);
      const group = await W.WWebJS._getChat(groupId);
      if (!group) return;
      switch (action) {
        case 'add': return GroupAction.addParticipants?.(group, wids);
        case 'remove': return GroupAction.removeParticipants?.(group, wids);
        case 'promote': return GroupAction.promoteParticipants?.(group, wids);
        case 'demote': return GroupAction.demoteParticipants?.(group, wids);
      }
    };

    /**
     * Set profile name
     */
    W.WWebJS.setProfileName = async function (name: string) {
      const ProfileAction = W.require?.('WAWebSetPushnameAction');
      return ProfileAction?.setPushname?.(name) || null;
    };

    /**
     * Set profile status
     */
    W.WWebJS.setProfileStatus = async function (status: string) {
      const StatusAction = W.require?.('WAWebSetMyStatusAction');
      return StatusAction?.setMyStatus?.(status) || null;
    };

    /**
     * Send typing state
     */
    W.WWebJS.sendChatState = async function (chatId: string, state: number) {
      const ChatState = W.require?.('WAWebChatStateAction');
      const chat = await W.WWebJS._getChat(chatId);
      if (!chat || !ChatState) return;
      return ChatState.sendChatState?.(chat, state);
    };

    /**
     * Pin/unpin chat
     */
    W.WWebJS.pinChat = async function (chatId: string, pin: boolean) {
      const PinAction = W.require?.('WAWebPinChatAction');
      const chat = await W.WWebJS._getChat(chatId);
      if (!chat || !PinAction) return;
      return PinAction.pinChat?.(chat, pin);
    };

    /**
     * Archive/unarchive chat
     */
    W.WWebJS.archiveChat = async function (chatId: string, archive: boolean) {
      const ArchiveAction = W.require?.('WAWebArchiveChatAction');
      const chat = await W.WWebJS._getChat(chatId);
      if (!chat || !ArchiveAction) return;
      return ArchiveAction.archiveChat?.(chat, archive);
    };

    /**
     * Forward messages
     */
    W.WWebJS.forwardMessages = async function (chatId: string, msgIds: string[]) {
      const chat = await W.WWebJS._getChat(chatId);
      if (!chat) return;
      const ForwardAction = W.require?.('WAWebChatForwardMessage');
      const Msg = W.require?.('WAWebCollections')?.Msg;
      if (!ForwardAction || !Msg) return;
      const msgs = msgIds.map((id) => Msg.get(id)).filter(Boolean);
      return ForwardAction.forwardMessages?.({ chat, msgs, multicast: true, includeCaption: true });
    };

    /**
     * Logout
     */
    W.WWebJS.logout = async function () {
      const Cmd = W.require?.('WAWebCmd')?.Cmd;
      return Cmd?.logout?.();
    };

    /**
     * Use here (take over session)
     */
    W.WWebJS.useHere = async function () {
      const Cmd = W.require?.('WAWebCmd')?.Cmd;
      return Cmd?.takeover?.();
    };
  });
}
