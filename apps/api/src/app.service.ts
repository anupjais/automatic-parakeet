import { UserRole, APP_CONSTANTS } from '@commerce/shared';

import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello() {
    return {
      message: 'Premium E-commerce API',
      role: UserRole.ADMIN,
      version: APP_CONSTANTS.API_VERSION,
    };
  }
}
