import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export type BranchSession = {
  id: string;
  name: string;
  username: string;
  type: 'WHOLESALE_RETAIL' | 'RETAIL';
  isMain: boolean;
  warehouseId: string;
};

export type PagePortalSession = {
  id: string;
  name: string;
  username: string;
  publicCode: number;
};

export type AuthUser = {
  id: string;
  email?: string | null;
  phone?: string | null;
  name: string;
  roles: string[];
  permissions: string[];
  branch?: BranchSession | null;
  pagePortal?: PagePortalSession | null;
};

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user as AuthUser;
  },
);
