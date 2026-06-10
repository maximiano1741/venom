import { Browser, Page } from 'puppeteer';
import { VenomConfig, createConfig } from '../config';
import { VenomClient, ConnectionState } from '../core/client';
import {
  launchBrowser,
  initPage,
  waitForReady,
  needsAuth,
  getQRCode,
  getConnectionState,
  injectWAPI,
} from '../controllers/browser';
import { Logger } from '../utils/logger';
import * as qrTerminal from 'qrcode-terminal';

/**
 * QR callback type
 */
export type CatchQR = (
  qrCode: string,
  asciiQR: string,
  attempt: number,
  urlCode?: string
) => void;

/**
 * Status callback type
 */
export type StatusFind = (
  status: string,
  session: string,
  info?: string
) => void;

/**
 * Create options
 */
export interface CreateOptions extends Partial<VenomConfig> {
  session: string;
  catchQR?: CatchQR;
  statusFind?: StatusFind;
}

/**
 * Create a new Venom client
 *
 * @example
 * ```js
 * import { create } from 'venom-bot';
 *
 * const client = await create({ session: 'my-bot' });
 * client.onMessage((msg) => {
 *   client.sendText(msg.from, 'Hello!');
 * });
 * ```
 */
export async function create(options: CreateOptions): Promise<VenomClient>;
export async function create(
  session: string,
  catchQR?: CatchQR,
  statusFind?: StatusFind,
  options?: Partial<VenomConfig>
): Promise<VenomClient>;
export async function create(
  sessionOrOptions: string | CreateOptions,
  catchQR?: CatchQR,
  statusFind?: StatusFind,
  options?: Partial<VenomConfig>
): Promise<VenomClient> {
  let session = 'session';
  let config: Partial<VenomConfig> = {};
  let qrCallback: CatchQR | undefined;
  let statusCallback: StatusFind | undefined;

  if (typeof sessionOrOptions === 'string') {
    session = sessionOrOptions;
    config = options || {};
    qrCallback = catchQR;
    statusCallback = statusFind;
  } else {
    session = sessionOrOptions.session;
    qrCallback = sessionOrOptions.catchQR;
    statusCallback = sessionOrOptions.statusFind;
    config = sessionOrOptions;
  }

  const fullConfig = createConfig({ ...config, session });
  const log = Logger.get(session);

  if (fullConfig.debug) {
    Logger.enableDebug(session);
  }

  // Check Node.js version
  const nodeVersion = parseInt(process.versions.node.split('.')[0], 10);
  if (nodeVersion < 18) {
    throw new Error(`Node.js 18+ required. Current: ${process.versions.node}`);
  }

  log.info(`Starting Venom session: ${session}`);

  statusCallback?.('initBrowser', session);

  // Launch browser
  const browser = await launchBrowser(fullConfig);

  statusCallback?.('openBrowser', session);
  log.info('Browser opened');

  // Initialize WhatsApp Web page
  const page = await initPage(browser, fullConfig);

  statusCallback?.('initWhatsapp', session);

  // Wait for WhatsApp Web to load
  const ready = await waitForReady(page, fullConfig.autoClose || 30000);
  if (!ready) {
    await browser.close();
    throw new Error('WhatsApp Web failed to load within timeout');
  }

  log.info('WhatsApp Web loaded');

  // Handle authentication
  if (await needsAuth(page)) {
    statusCallback?.('waitForLogin', session);
    log.info('Waiting for authentication...');

    let qrRetries = 0;
    const maxRetries = fullConfig.qrMaxRetries || 5;

    while (await needsAuth(page)) {
      if (qrRetries >= maxRetries) {
        await browser.close();
        throw new Error(`QR max retries reached (${maxRetries})`);
      }

      const qrData = await getQRCode(page);
      if (qrData) {
        qrRetries++;

        if (fullConfig.logQR) {
          qrTerminal.generate(qrData, { small: true });
        }

        qrCallback?.(qrData, qrData, qrRetries);
        statusCallback?.('waitForLogin', session, `QR attempt ${qrRetries}`);
      }

      await new Promise((r) => setTimeout(r, 5000));
    }
  }

  statusCallback?.('successPageWhatsapp', session);
  log.info('Authenticated');

  // Inject WAPI layer
  await injectWAPI(page);
  log.info('WAPI injected');

  // Create client
  const client = new VenomClient(browser, page, fullConfig);

  // Wait for main page to load (chat list)
  await page.waitForSelector('#app .two', { timeout: 30000 }).catch(() => {});

  // Attach event listeners
  await attachEventListeners(page, client);

  client._setReady(true);
  statusCallback?.('successChat', session);
  log.info('Client ready!');

  client.emit('ready');

  // Handle browser close
  browser.on('disconnected', async () => {
    client._setReady(false);
    client.emit('disconnected', 'BROWSER_DISCONNECTED');
    statusCallback?.('browserClose', session);
    log.warn('Browser disconnected');
  });

  return client;
}

/**
 * Attach WhatsApp Web event listeners to the Venom client
 */
async function attachEventListeners(page: Page, client: VenomClient): Promise<void> {
  // Expose callback functions to browser context
  await page.exposeFunction('_venomOnMessage', (msg: any) => {
    if (msg.fromMe) {
      client.emit('message_create', msg);
    } else {
      client.emit('message', msg);
    }
    client.emit('message_create', msg);
  });

  await page.exposeFunction('_venomOnMessageAck', (msg: any, ack: number) => {
    client.emit('message_ack', msg, ack);
  });

  await page.exposeFunction('_venomOnStateChange', (state: string) => {
    client.emit('change_state', state);

    if (state === 'CONFLICT') {
      client.emit('conflict');
    }
  });

  await page.exposeFunction('_venomOnIncomingCall', (call: any) => {
    client.emit('incoming_call', call);
  });

  await page.exposeFunction('_venomOnGroupUpdate', (notification: any) => {
    if (notification.subtype === 'add' || notification.subtype === 'invite') {
      client.emit('group_join', notification);
    } else if (notification.subtype === 'remove' || notification.subtype === 'leave') {
      client.emit('group_leave', notification);
    } else {
      client.emit('group_update', notification);
    }
  });

  await page.exposeFunction('_venomOnLogout', () => {
    client.emit('disconnected', 'LOGOUT');
  });

  // Inject event hooks into WhatsApp Web
  await page.evaluate(() => {
    const W = window as any;

    // Message events
    const MsgCollection = W.require?.('WAWebMsgCollection');
    if (MsgCollection) {
      MsgCollection.on('add', (msg: any) => {
        const serialized = msg.serialize?.();
        if (serialized) {
          W._venomOnMessage(serialized);
        }
      });
    }

    // Message ack events
    const AckHandler = W.require?.('WAWebMsgAckCollection');
    if (AckHandler) {
      AckHandler.on('add', (ack: any) => {
        const msg = ack.ackMessage?.serialize?.();
        if (msg) {
          W._venomOnMessageAck(msg, ack.ack);
        }
      });
    }

    // Connection state changes
    const Socket = W.require?.('WAWebSocketModel')?.Socket;
    if (Socket) {
      Socket.on('change:state', (_: any, state: string) => {
        W._venomOnStateChange(state);
      });
    }

    // Incoming calls
    const CallStore = W.require?.('WAWebCallCollection');
    if (CallStore) {
      CallStore.on('add', (call: any) => {
        W._venomOnIncomingCall(call.serialize?.());
      });
    }

    // Group notifications (gp2 messages)
    const GroupNotif = W.require?.('WAWebMsgCollection');
    if (GroupNotif) {
      GroupNotif.on('add', (msg: any) => {
        if (msg.type === 'gp2') {
          W._venomOnGroupUpdate(msg.serialize?.());
        }
      });
    }

    // Logout
    const Cmd = W.require?.('WAWebCmd')?.Cmd;
    if (Cmd) {
      Cmd.on('logout', () => W._venomOnLogout());
      Cmd.on('logout_from_bridge', () => W._venomOnLogout());
    }
  });
}
