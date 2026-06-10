/**
 * Venom Bot Configuration
 */
export interface VenomConfig {
  /** Session name */
  session: string;

  /** Headless mode (default: true) */
  headless?: boolean | 'new';

  /** Open DevTools */
  devtools?: boolean;

  /** Log QR code in terminal */
  logQR?: boolean;

  /** Browser WebSocket endpoint */
  browserWS?: string;

  /** Extra browser arguments */
  browserArgs?: string[];

  /** Additional browser args (appended, not overwritten) */
  addBrowserArgs?: string[];

  /** Puppeteer launch options override */
  puppeteerOptions?: Record<string, any>;

  /** Disable spinners animation */
  disableSpins?: boolean;

  /** Disable welcome screen */
  disableWelcome?: boolean;

  /** Log updates in terminal */
  updatesLog?: boolean;

  /** Auto close timeout in ms (0 = disabled) */
  autoClose?: number;

  /** Custom browser executable path */
  browserPathExecutable?: string;

  /** Token directory path */
  tokenDir?: string;

  /** Proxy server(s) */
  addProxy?: string[];

  /** Proxy username */
  userProxy?: string;

  /** Proxy password */
  userPass?: string;

  /** Custom user agent */
  userAgent?: string;

  /** Wait for login before resolving */
  waitForLogin?: boolean;

  /** WhatsApp Web version to use */
  webVersion?: string;

  /** Debug mode */
  debug?: boolean;

  /** QR max retries */
  qrMaxRetries?: number;

  /** Takeover on conflict */
  takeoverOnConflict?: boolean;

  /** Takeover timeout in ms */
  takeoverTimeoutMs?: number;

  /** Device name for linked device */
  deviceName?: string;
}

/** Default configuration */
export const defaultConfig: VenomConfig = {
  session: 'session',
  headless: true,
  devtools: false,
  logQR: true,
  disableSpins: false,
  disableWelcome: false,
  updatesLog: true,
  autoClose: 60000,
  waitForLogin: true,
  qrMaxRetries: 5,
  takeoverOnConflict: true,
  takeoverTimeoutMs: 3000,
  debug: false,
};

/**
 * Create config with defaults merged
 */
export function createConfig(overrides: Partial<VenomConfig> = {}): VenomConfig {
  return {
    ...defaultConfig,
    ...overrides,
  };
}
