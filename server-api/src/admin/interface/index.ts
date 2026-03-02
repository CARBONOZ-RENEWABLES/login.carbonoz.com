import { ERole } from '@prisma/client';

export interface UserInformation {
  firstName: string;
  lastName: string;
  customerTimezone: string;
}

export interface UserTransformation {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  active: boolean;
  role: ERole;
  email: string;
  password: string;
  activeStatus: boolean;
  manualAccessOverride?: boolean;
  manualAccessExpiry?: Date;
  UserInformation?: Array<UserInformation>;
}

export interface TransformedUser
  extends Omit<UserTransformation, 'password' | 'UserInformation'>,
    UserInformation {}
