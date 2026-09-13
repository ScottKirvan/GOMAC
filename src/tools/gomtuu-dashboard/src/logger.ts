export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

function timestamp(): string {
  return new Date().toISOString();
}

export const consoleLogger: Logger = {
  info(message) {
    console.log(`[${timestamp()}] INFO ${message}`);
  },
  warn(message) {
    console.warn(`[${timestamp()}] WARN ${message}`);
  },
  error(message) {
    console.error(`[${timestamp()}] ERROR ${message}`);
  },
};
