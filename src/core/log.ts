/**
 * Tagged logging. Info logs are silenced unless dev mode is on, so release players see a clean console.
 * Errors always log: they are the signal that something needs fixing.
 */
let verbose = false;

export const log = {
  setVerbose(on: boolean): void {
    verbose = on;
  },
  info(tag: string, message: string, ...extra: unknown[]): void {
    if (verbose) console.log(`[${tag}] ${message}`, ...extra);
  },
  warn(tag: string, message: string, ...extra: unknown[]): void {
    console.warn(`[${tag}] ${message}`, ...extra);
  },
  error(tag: string, message: string, ...extra: unknown[]): void {
    console.error(`[${tag}] ${message}`, ...extra);
  },
};
