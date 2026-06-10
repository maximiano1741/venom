import puppeteer, { Browser, Page, LaunchOptions } from 'puppeteer';
import * as path from 'path';
import * as fs from 'fs';
import { VenomConfig } from '../config';
import { Logger } from '../utils/logger';

const WHATSAPP_WEB_URL = 'https://web.whatsapp.com/';

/**
 * Default Chrome arguments for optimal performance
 */
const DEFAULT_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-accelerated-2d-canvas',
  '--no-first-run',
  '--no-zygote',
  '--disable-gpu',
  '--disable-blink-features=AutomationControlled',
];

/**
 * Default User-Agent to appear as a normal browser
 */
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/**
 * Get Chromium executable path
 */
function getChromiumPath(config: VenomConfig): string | undefined {
  // 1. User specified path
  if (config.browserPathExecutable) {
    return config.browserPathExecutable;
  }

  // 2. Puppeteer's bundled browser
  try {
    const pPath = puppeteer.executablePath();
    if (fs.existsSync(pPath)) return pPath;
  } catch {}

  // 3. Our downloaded Chromium
  const localChrome = path.join(__dirname, '..', '..', '.chromium');
  if (fs.existsSync(localChrome)) {
    const dirs = fs.readdirSync(localChrome);
    for (const dir of dirs) {
      const chromePath = path.join(localChrome, dir);
      if (fs.existsSync(chromePath)) {
        // Find the actual executable
        const subDirs = fs.readdirSync(chromePath, { recursive: true }) as string[];
        const exe = subDirs.find((f: string) =>
          f.includes('chrome') && (f.endsWith('.exe') || !path.extname(f)) && !f.includes('.pak')
        );
        if (exe) return path.join(chromePath, exe as string);
      }
    }
  }

  // Let Puppeteer figure it out
  return undefined;
}

/**
 * Launch browser instance
 */
export async function launchBrowser(config: VenomConfig): Promise<Browser> {
  const log = Logger.get(config.session);

  const args = [
    ...DEFAULT_ARGS,
    ...(config.browserArgs || []),
  ];

  if (config.addProxy?.length) {
    args.push(`--proxy-server=${config.addProxy[0]}`);
  }

  const launchOptions: LaunchOptions = {
    headless: config.headless === 'new' ? true : (config.headless ?? true),
    args,
    executablePath: getChromiumPath(config),
    userDataDir: path.join(
      config.tokenDir || path.join(process.cwd(), 'tokens'),
      config.session
    ),
    ...(config.browserWS ? { browserWSEndpoint: config.browserWS } : {}),
    ...(config.puppeteerOptions || {}),
  };

  log.info('Launching browser...');

  const browser = await puppeteer.launch(launchOptions);

  log.info('Browser launched successfully');

  return browser;
}

/**
 * Initialize WhatsApp Web page
 */
export async function initPage(browser: Browser, config: VenomConfig): Promise<Page> {
  const log = Logger.get(config.session);

  const page = (await browser.pages())[0] || await browser.newPage();

  // Set user agent
  await page.setUserAgent(config.userAgent || DEFAULT_USER_AGENT);

  // Bypass CSP
  await page.setBypassCSP(true);

  // Set default timeout
  page.setDefaultTimeout(60000);

  // Block unnecessary resources for performance
  if (config.headless) {
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const resourceType = req.resourceType();
      if (['font', 'media', 'image'].includes(resourceType)) {
        req.abort();
      } else {
        req.continue();
      }
    });
  }

  // Intercept specific WhatsApp Web version
  if (config.webVersion) {
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (req.url() === WHATSAPP_WEB_URL) {
        const cacheUrl = `https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/${config.webVersion}.html`;
        req.respond({
          status: 200,
          contentType: 'text/html',
          body: '', // Will fetch
        });
      } else {
        req.continue();
      }
    });
  }

  log.info('Navigating to WhatsApp Web...');

  await page.goto(WHATSAPP_WEB_URL, {
    waitUntil: 'domcontentloaded',
    timeout: 0,
  });

  log.info('WhatsApp Web loaded');

  return page;
}

/**
 * Wait for WhatsApp Web to be ready (window.Debug.VERSION exists)
 */
export async function waitForReady(page: Page, timeout = 30000): Promise<boolean> {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    const ready = await page.evaluate(() => {
      return typeof (window as any).Debug?.VERSION !== 'undefined';
    }).catch(() => false);

    if (ready) return true;
    await new Promise((r) => setTimeout(r, 500));
  }

  return false;
}

/**
 * Get WhatsApp connection state
 */
export async function getConnectionState(page: Page): Promise<string> {
  return page.evaluate(() => {
    try {
      const Socket = (window as any).require?.('WAWebSocketModel')?.Socket;
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
  return page.evaluate(() => {
    try {
      const Conn = (window as any).require?.('WAWebConnModel')?.Conn;
      const SignalStore = (window as any).require?.('WAWebSignalStoreApi')?.waSignalStore;
      const NoiseInfo = (window as any).require?.('WAWebUserPrefsInfoStore')?.waNoiseInfo;
      const Base64 = (window as any).require?.('WABase64');
      const MultiDevice = (window as any).require?.('WAWebUserPrefsMultiDevice');

      if (!Conn?.ref || !SignalStore || !NoiseInfo || !Base64 || !MultiDevice) {
        return null;
      }

      const registrationInfo = SignalStore.getRegistrationInfo();
      const noiseKeyPair = NoiseInfo.get();
      const staticKeyB64 = Base64.encodeB64(noiseKeyPair.staticKeyPair.pubKey);
      const identityKeyB64 = Base64.encodeB64(registrationInfo.identityKeyPair.pubKey);
      const advSecret = MultiDevice.getADVSecretKey();

      return `${Conn.ref},${staticKeyB64},${identityKeyB64},${advSecret}`;
    } catch {
      return null;
    }
  }).catch(() => null);
}

/**
 * Request pairing code instead of QR
 */
export async function requestPairingCode(page: Page, phoneNumber: string): Promise<string> {
  return page.evaluate(async (phone: string) => {
    const Api = (window as any).require?.('WAWebAltDeviceLinkingApi');
    if (!Api) throw new Error('Pairing API not available');

    Api.setPairingType('ALT_DEVICE_LINKING');
    await Api.initializeAltDeviceLinking();
    return Api.startAltLinkingFlow(phone, true);
  }, phoneNumber);
}

/**
 * Inject the WWebJS utility layer into WhatsApp Web
 * This exposes functions that Venom uses to interact with WhatsApp
 */
export async function injectWAPI(page: Page): Promise<void> {
  await page.evaluate(() => {
    if ((window as any).WWebJS) return; // already injected

    const WWebJS: any = {};
    const W = (window as any);

    // Helper to get Store modules
    const req = (mod: string) => W.require?.(mod);

    // Send message
    WWebJS.sendTextMessage = async (chatId: string, text: string, options: any = {}) => {
      const ChatStore = req('WAWebChatCollection');
      const MsgStore = req('WAWebMsgCollection');
      const SendMsg = req('WAWebSendMsgChatAction');

      const chat = await ChatStore.find(chatId);
      if (!chat) throw new Error(`Chat not found: ${chatId}`);

      const msgData = {
        type: 'chat',
        body: text,
        quotedMsg: options.quotedMsgId ? MsgStore.get(options.quotedMsgId) : undefined,
        mentionedJidList: options.mentions || [],
      };

      return SendMsg.sendTextMsgToChat(chat, msgData);
    };

    // Send media
    WWebJS.sendMediaMessage = async (chatId: string, mediaData: any) => {
      const ChatStore = req('WAWebChatCollection');
      const SendMedia = req('WAWebSendMediaChatAction');

      const chat = await ChatStore.find(chatId);
      if (!chat) throw new Error(`Chat not found: ${chatId}`);

      return SendMedia.sendMediaToChat(chat, mediaData);
    };

    // Get all chats
    WWebJS.getAllChats = () => {
      const ChatStore = req('WAWebChatCollection');
      return ChatStore?.getModelsArray?.()?.map((c: any) => c.serialize?.()) || [];
    };

    // Get all contacts
    WWebJS.getAllContacts = () => {
      const ContactStore = req('WAWebContactCollection');
      return ContactStore?.getModelsArray?.()?.map((c: any) => c.serialize?.()) || [];
    };

    // Get chat by ID
    WWebJS.getChat = async (chatId: string) => {
      const ChatStore = req('WAWebChatCollection');
      const chat = await ChatStore?.find(chatId);
      return chat?.serialize?.();
    };

    // Get messages in chat
    WWebJS.getMessages = (chatId: string, count: number) => {
      const ChatStore = req('WAWebChatCollection');
      const chat = ChatStore?.get(chatId);
      if (!chat) return [];
      const msgs = chat.msgs?.getModelsArray?.()?.slice(-count) || [];
      return msgs.map((m: any) => m.serialize?.());
    };

    // Get profile picture
    WWebJS.getProfilePic = async (chatId: string) => {
      const PicStore = req('WAWebProfilePicThumbCollection');
      const pic = await PicStore?.find(chatId);
      return pic?.eurl || null;
    };

    // Group functions
    WWebJS.getGroupMembers = (groupId: string) => {
      const GroupStore = req('WAWebGroupCollection');
      const group = GroupStore?.get(groupId);
      return group?.participants?.getModelsArray?.()?.map((p: any) => p.serialize?.()) || [];
    };

    WWebJS.getGroupAdmins = (groupId: string) => {
      const GroupStore = req('WAWebGroupCollection');
      const group = GroupStore?.get(groupId);
      return group?.participants?.getModelsArray?.()
        ?.filter((p: any) => p.isAdmin || p.isSuperAdmin)
        ?.map((p: any) => p.id?.toString?.()) || [];
    };

    // Check number status
    WWebJS.checkNumberStatus = async (chatId: string) => {
      const WapQuery = req('WAWebWidToJid');
      try {
        const result = await WapQuery?.queryExist?.(chatId);
        return { exists: !!result?.wid, jid: result?.wid?.toString?.() };
      } catch {
        return { exists: false };
      }
    };

    // Get connection info
    WWebJS.getConnectionInfo = () => {
      const Conn = req('WAWebConnModel')?.Conn;
      if (!Conn) return null;
      return {
        wid: Conn.wid?.toString?.(),
        phone: Conn.phone?.toString?.(),
        platform: Conn.platform,
        pushname: Conn.pushname,
      };
    };

    // Get battery level
    WWebJS.getBatteryLevel = () => {
      const Battery = req('WAWebBatteryState');
      return Battery?.battery || null;
    };

    // Block/Unblock contact
    WWebJS.blockContact = async (chatId: string) => {
      const BlockStore = req('WAWebBlockContactAction');
      const ContactStore = req('WAWebContactCollection');
      const contact = ContactStore?.get(chatId);
      if (contact) return BlockStore?.blockContact?.(contact);
    };

    WWebJS.unblockContact = async (chatId: string) => {
      const BlockStore = req('WAWebBlockContactAction');
      const ContactStore = req('WAWebContactCollection');
      const contact = ContactStore?.get(chatId);
      if (contact) return BlockStore?.unblockContact?.(contact);
    };

    // Send seen
    WWebJS.sendSeen = async (chatId: string) => {
      const ChatStore = req('WAWebChatCollection');
      const SendSeen = req('WAWebSendSeenChatAction');
      const chat = ChatStore?.get(chatId);
      if (chat) return SendSeen?.sendSeen?.(chat);
    };

    // Typing state
    WWebJS.setTyping = async (chatId: string, isTyping: boolean) => {
      const ChatStore = req('WAWebChatCollection');
      const chat = ChatStore?.get(chatId);
      if (!chat) return;

      const Cmd = req('WAWebCmd')?.Cmd;
      if (isTyping) {
        Cmd?.sendPresenceAvailable?.();
      } else {
        Cmd?.sendPresenceUnavailable?.();
      }
    };

    // Delete message
    WWebJS.deleteMessage = async (chatId: string, messageIds: string[], everyone: boolean) => {
      const ChatStore = req('WAWebChatCollection');
      const MsgStore = req('WAWebMsgCollection');
      const chat = ChatStore?.get(chatId);
      if (!chat) return;

      const msgs = messageIds
        .map((id) => MsgStore?.get(id))
        .filter(Boolean);

      if (everyone) {
        const Revoke = req('WAWebRevokeMsgAction');
        return Revoke?.revokeMessages?.(chat, msgs);
      } else {
        const Delete = req('WAWebDeleteMsgAction');
        return Delete?.deleteMessages?.(chat, msgs);
      }
    };

    // Set profile
    WWebJS.setProfileStatus = async (status: string) => {
      const StatusStore = req('WAWebSetStatusAction');
      return StatusStore?.setStatus?.(status);
    };

    WWebJS.setProfileName = async (name: string) => {
      const ProfileStore = req('WAWebSetPushnameAction');
      return ProfileStore?.setPushname?.(name);
    };

    // Get host device info
    WWebJS.getHostDevice = () => {
      const Conn = req('WAWebConnModel')?.Conn;
      if (!Conn) return null;
      return Conn.serialize?.();
    };

    // Get WhatsApp Web version
    WWebJS.getWAVersion = () => {
      return (window as any).Debug?.VERSION || null;
    };

    (window as any).WWebJS = WWebJS;
  });
}
