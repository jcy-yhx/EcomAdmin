import { WinstonModule, utilities as nestWinstonUtils } from 'nest-winston';
import * as winston from 'winston';

export function createLogger() {
  return WinstonModule.createLogger({
    transports: [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.ms(),
          nestWinstonUtils.format.nestLike('EcomAdmin', {
            colors: true,
            prettyPrint: true,
          }),
        ),
      }),
      new winston.transports.File({
        filename: 'logs/error.log',
        level: 'error',
        format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
      }),
    ],
  });
}
