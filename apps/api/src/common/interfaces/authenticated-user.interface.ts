import { UserRole } from '../../generated/prisma/enums.js';

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}
