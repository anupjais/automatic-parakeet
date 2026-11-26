import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service.js';

@ApiTags('App')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({ summary: 'Get API welcome information' })
  @ApiOkResponse({
    description: 'API information returned successfully',
  })
  getHello() {
    return this.appService.getHello();
  }
}
