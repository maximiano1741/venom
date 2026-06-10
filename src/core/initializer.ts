import { Page } from 'puppeteer';
import {
  launchBrowser,
  initPage,
  waitForReady,
  waitForSocketReady,
  needsAuth,
  injectWAPI,
  getConnectionState,
} from '../controllers/browser';
import { VenomConfig, createConfig } from '../config';
import { VenomClient } from './client';
import { Logger } from '../utils/logger';
import qrcodeTerminal from 'qrcode-terminal';

/**
 * Callback for QR code events
 */
export type CatchQR = (qrCode: string, asciiQR: string, attempt: number) => void;

/**
 * Callback for status events
 */
export type StatusFind = (status: string, session: string) => void;

/**
 * Options for creating a Venom client
 */
export interface CreateOptions extends Partial<VenomConfig> {
  session: string;
  catchQR?: CatchQR;
  statusFind?: StatusFind;
}

/**
 * Create a new Venom client instance
 *
 * @example
 * ```ts
 * const client = await create({
 *   session: 'my-session',
 *   catchQR: (qr, ascii) => console.log(ascii),
 *   statusFind: (status) => console.log(status),
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
  const ready = await waitForReady(page, fullConfig.autoClose || 60000);
  if (!ready) {
    await browser.close();
    throw new Error('WhatsApp Web failed to load within timeout');
  }

  log.info('WhatsApp Web loaded, waiting for socket...');

  // Wait for the socket state to become known
  const socketState = await waitForSocketReady(page, 30000);
  log.info(`Socket state: ${socketState}`);

  // Create client (needed before auth so we can attach state change listener)
  const client = new VenomClient(browser, page, fullConfig);

  // Handle authentication
  if (await needsAuth(page)) {
    statusCallback?.('waitForLogin', session);
    log.info('Waiting for authentication...');

    // QR timeout and refresh controlled by Venom (not WhatsApp Web)
    const qrTimeout = fullConfig.qrTimeout || 60000; // 60s per QR
    const qrMaxRetries = fullConfig.qrMaxRetries || 10;
    let qrRetries = 0;
    let authenticated = false;
    let currentQRResolve: (() => void) | null = null;

    // Set up auth state listener
    const authPromise = new Promise<void>((resolve, reject) => {
      // Global timeout (5 minutes total)
      const globalTimeout = setTimeout(() => {
        if (!authenticated) reject(new Error('Authentication timeout (5 min)'));
      }, 5 * 60 * 1000);

      page.exposeFunction('_venomOnAuthStateChange', (state: string) => {
        log.info(`Auth state: ${state}`);
        if (state === 'CONNECTED' || state === 'SYNCING' || state === 'OPENING') {
          authenticated = true;
          clearTimeout(globalTimeout);
          if (currentQRResolve) currentQRResolve();
          resolve();
        }
      });
    });

    // Expose QR change callback
    page.exposeFunction('_venomOnQRChanged', (qr: string) => {
      qrRetries++;
      log.info(`QR Code ready (attempt ${qrRetries})`);

      if (qrRetries > qrMaxRetries) {
        log.warn(`Max QR retries (${qrMaxRetries}) reached`);
        return;
      }

      let asciiQR = '';
      try {
        const lines: string[] = [];
        qrcodeTerminal.generate(qr, { small: true }, (line: string) => {
          lines.push(line);
        });
        asciiQR = lines.join('\n');
      } catch {
        asciiQR = qr;
      }

      if (fullConfig.logQR) {
        console.log('\n' + '='.repeat(50));
        console.log(`📱 QR CODE - TENTATIVA ${qrRetries}/${qrMaxRetries}`);
        console.log('='.repeat(50));
        console.log(asciiQR);
        console.log('='.repeat(50));
        console.log('⏱️  QR expira em 60 segundos\n');
      }

      qrCallback?.(qr, asciiQR, qrRetries);
    });

    // Hook into WhatsApp Web
    await page.evaluate(() => {
      const W = window as any;

      // Build QR string from ref
      const buildQR = async (ref: string) => {
        try {
          const SignalStore = W.require('WAWebSignalStoreApi')?.waSignalStore;
          const NoiseInfo = W.require('WAWebUserPrefsInfoStore')?.waNoiseInfo;
          const Base64 = W.require('WABase64');
          const MultiDevice = W.require('WAWebUserPrefsMultiDevice');

          if (!SignalStore || !NoiseInfo || !Base64 || !MultiDevice) return null;

          const registrationInfo = await SignalStore.getRegistrationInfo();
          const noiseKeyPair = await NoiseInfo.get();
          const staticKeyB64 = Base64.encodeB64(noiseKeyPair.staticKeyPair.pubKey);
          const identityKeyB64 = Base64.encodeB64(registrationInfo.identityKeyPair.pubKey);
          const advSecretKey = MultiDevice.getADVSecretKey();

          let platform = '';
          try {
            platform = W.require('WAWebCompanionRegClientUtils')?.DEVICE_PLATFORM || '';
          } catch {}

          return [ref, staticKeyB64, identityKeyB64, advSecretKey, platform].join(',');
        } catch (e) {
          return null;
        }
      };

      // Initial QR
      (async () => {
        const Conn = W.require('WAWebConnModel')?.Conn;
        if (Conn?.ref) {
          const qr = await buildQR(Conn.ref);
          if (qr) W._venomOnQRChanged(qr);
        }
      })();

      // Listen for QR ref changes
      const Conn = W.require('WAWebConnModel')?.Conn;
      if (Conn?.on) {
        Conn.on('change:ref', async (_: any, ref: string) => {
          const qr = await buildQR(ref);
          if (qr) W._venomOnQRChanged(qr);
        });
      }

      // Listen for auth state changes
      const Socket = W.require('WAWebSocketModel')?.Socket;
      if (Socket?.on) {
        Socket.on('change:state', (_: any, state: string) => {
          W._venomOnAuthStateChange(state);
        });
      }
    });

    // Venom controls the QR lifecycle: wait, then refresh if needed
    const startTime = Date.now();
    while (!authenticated) {
      // Check if we exceeded total timeout
      if (Date.now() - startTime > 5 * 60 * 1000) {
        throw new Error('Authentication timeout (5 min)');
      }

      // Wait for current QR to be scanned (or expire)
      await new Promise<void>((resolve) => {
        currentQRResolve = resolve;
        setTimeout(() => {
          log.info(`QR expired after ${qrTimeout/1000}s, refreshing...`);
          // Refresh QR by calling refreshQR cmd
          page.evaluate(() => {
            const W = window as any;
            const Cmd = W.require?.('WAWebCmd')?.Cmd;
            Cmd?.refreshQR?.();
          }).catch(() => {});
          resolve();
        }, qrTimeout);
      });

      // Check if we got authenticated
      if (authenticated) break;

      // If max retries exceeded
      if (qrRetries >= qrMaxRetries) {
        throw new Error(`Max QR retries (${qrMaxRetries}) reached`);
      }
    }

    try {
      await authPromise;
    } catch (err) {
      await browser.close();
      throw err;
    }
  }

  statusCallback?.('successPageWhatsapp', session);
  log.info('Authenticated');

  // Inject WAPI layer
  await injectWAPI(page);
  log.info('WAPI injected');

  // Wait for chat interface to load
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
    if (msg?.fromMe) {
      client.emit('message_create', msg);
    } else {
      client.emit('message', msg);
    }
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
    if (notification?.subtype === 'add' || notification?.subtype === 'invite') {
      client.emit('group_join', notification);
    } else if (notification?.subtype === 'remove' || notification?.subtype === 'leave') {
      client.emit('group_leave', notification);
    } else {
      client.emit('group_update', notification);
    }
  });

  await page.exposeFunction('_venomOnLogout', () => {
    client.emit('disconnected', 'LOGOUT');
  });

  // Inject event hooks into WhatsApp Web — resilient
  await page.evaluate(() => {
    const W = window as any;

    function safeOn(obj: any, event: string, handler: Function) {
      if (obj && typeof obj.on === 'function') {
        obj.on(event, (...args: any[]) => {
          try {
            handler(...args);
          } catch {}
        });
      }
    }

    // Message events
    const MsgStore = W.require?.('WAWebCollections')?.Msg;
    safeOn(MsgStore, 'add', (msg: any) => {
      const serialized = msg?.serialize?.();
      if (serialized) {
        W._venomOnMessage(serialized);
        if (msg.type === 'gp2') {
          W._venomOnGroupUpdate(serialized);
        }
      }
    });

    // Message ack events
    const AckStore = W.require?.('WAWebMsgAckCollection')?.AckStore;
    safeOn(AckStore, 'add', (ack: any) => {
      const msg = ack?.ackMessage?.serialize?.();
      if (msg) {
        W._venomOnMessageAck(msg, ack.ack);
      }
    });

    // Connection state changes
    const Socket = W.require?.('WAWebSocketModel')?.Socket;
    safeOn(Socket, 'change:state', (_: any, state: string) => {
      W._venomOnStateChange(state);
    });

    // Incoming calls
    const CallStore = W.require?.('WAWebCallCollection')?.CallStore;
    safeOn(CallStore, 'add', (call: any) => {
      W._venomOnIncomingCall(call?.serialize?.());
    });

    // Logout
    const Cmd = W.require?.('WAWebCmd')?.Cmd;
    safeOn(Cmd, 'logout', () => W._venomOnLogout());
    safeOn(Cmd, 'logout_from_bridge', () => W._venomOnLogout());
  });
}
