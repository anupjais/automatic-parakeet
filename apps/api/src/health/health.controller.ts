import { Controller, Get } from '@nestjs/common';
import {
  ApiOperation,
  ApiOkResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { HealthService } from './health.service.js';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'Check API and database health' })
  @ApiOkResponse({
    description: 'API and database are healthy',
  })
  @ApiServiceUnavailableResponse({
    description: 'Database connection is unavailable',
  })
  check() {
    return this.healthService.check();
  }
}
