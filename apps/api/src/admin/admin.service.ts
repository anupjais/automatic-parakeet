import { Injectable } from '@nestjs/common';

@Injectable()
export class AdminService {
  getDashboard() {
    return {
      message: 'Admin dashboard accessed successfully',
      accessLevel: 'ADMIN',
      generatedAt: new Date().toISOString(),
    };
  }
}
