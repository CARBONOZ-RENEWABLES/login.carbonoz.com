import {
  applyDecorators,
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import { ApiOkResponse, ApiQuery } from '@nestjs/swagger';
import { ERole } from '@prisma/client';
import { IPagination } from 'src/__shared__/interfaces/pagination-interface';
import { getPaginatedSchema } from 'src/__shared__/utils/pagination';

export const ROLES_KEY = 'roles';
export const AllowRoles = (...roles: ERole[]) => SetMetadata(ROLES_KEY, roles);

export const GetUser = createParamDecorator(
  (_data, ctx: ExecutionContext): any => {
    const req = ctx.switchToHttp().getRequest();
    return req.user;
  },
);

export function Paginated() {
  return applyDecorators(
    ApiQuery({ name: 'page', required: false }),
    ApiQuery({ name: 'limit', required: false }),
  );
}

export const PaginationParams = createParamDecorator(
  (_data, ctx: ExecutionContext): IPagination => {
    const req = ctx.switchToHttp().getRequest();
    return {
      page: +req?.query?.page || 0,
      size: +req?.query?.limit || 10,
    };
  },
);

export function PageResponse(model?: any) {
  return applyDecorators(ApiOkResponse({ ...getPaginatedSchema(model) }));
}
