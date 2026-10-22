import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '@clarity/types';

export const ROLES_KEY = 'clarity:roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
