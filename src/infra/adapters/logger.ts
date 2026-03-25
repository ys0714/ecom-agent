export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_PRIORITY: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  traceId?: string;
  sessionId?: string;
  module?: string;
  data?: Record<string, unknown>;
}

export class Logger {
  private minLevel: LogLevel;
  private module: string;

  constructor(module: string, minLevel: LogLevel = 'info') {
    this.module = module;
    this.minLevel = minLevel;
  }

  debug(message: string, data?: Record<string, unknown>): void { this.log('debug', message, data); }
  info(message: string, data?: Record<string, unknown>): void { this.log('info', message, data); }
  warn(message: string, data?: Record<string, unknown>): void { this.log('warn', message, data); }
  error(message: string, data?: Record<string, unknown>): void { this.log('error', message, data); }

  child(module: string): Logger {
    return new Logger(`${this.module}.${module}`, this.minLevel);
  }

  private log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[this.minLevel]) return;

    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      module: this.module,
      ...(data ?? {}),
    };

    const output = JSON.stringify(entry);
    if (level === 'error') {
      process.stderr.write(output + '\n');
    } else {
      process.stdout.write(output + '\n');
    }
  }
}

export const rootLogger = new Logger('ecom-agent', (process.env.LOG_LEVEL as LogLevel) ?? 'info');
