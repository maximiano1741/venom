import pino from 'pino';

const loggers = new Map<string, pino.Logger>();

/**
 * Logger utility for Venom
 */
export const Logger = {
  /**
   * Get or create a logger for a session
   */
  get(session: string): pino.Logger {
    if (loggers.has(session)) {
      return loggers.get(session)!;
    }

    const logger = pino({
      name: `venom:${session}`,
      level: 'info',
    });

    loggers.set(session, logger);
    return logger;
  },

  /**
   * Set log level for a session
   */
  setLevel(session: string, level: string): void {
    const logger = this.get(session);
    logger.level = level;
  },

  /**
   * Enable debug mode
   */
  enableDebug(session: string): void {
    this.setLevel(session, 'debug');
  },
};
