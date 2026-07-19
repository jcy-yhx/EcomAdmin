import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { OperationLogController } from './operation-log.controller';
import { OperationLogInterceptor } from './operation-log.interceptor';

@Module({
  controllers: [OperationLogController],
  providers: [{ provide: APP_INTERCEPTOR, useClass: OperationLogInterceptor }],
})
export class OperationLogModule {}
