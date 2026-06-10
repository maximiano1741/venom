// ─── New Venom ─────────────────────────────────────────────
// High-performance WhatsApp automation framework for Node.js
// ────────────────────────────────────────────────────────────

// Core
export { VenomClient, VenomMessage, ConnectionState, AckType } from './core/client';
export { create, CreateOptions, CatchQR, StatusFind } from './core/initializer';

// Config
export { VenomConfig, createConfig, defaultConfig } from './config';

// Types
export type { Browser, Page } from 'puppeteer';
