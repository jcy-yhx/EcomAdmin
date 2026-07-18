import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Health')
@Controller()
export class HealthController {
  @Public()
  @Get()
  @ApiOperation({ summary: 'Root health check' })
  root() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Public()
  @Get('health')
  @ApiOperation({ summary: 'Health check endpoint' })
  health() {
    return {
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }
}
