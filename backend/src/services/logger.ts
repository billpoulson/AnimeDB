import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
      const tag = service ? `[${service}]` : '';
      const extra = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
      return `${timestamp} ${level.toUpperCase()} ${tag} ${message}${extra}`;
    }),
  ),
  transports: [new winston.transports.Console()],
});

export function createLogger(service: string) {
  return logger.child({ service });
}

export default logger;
