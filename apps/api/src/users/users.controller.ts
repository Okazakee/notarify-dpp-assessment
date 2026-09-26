import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common'
import type { AuditContext } from '../audit/audit.types.js'
import type { AuthenticatedRequest } from '../auth/access-token.guard.js'
import { AccessTokenGuard } from '../auth/access-token.guard.js'
import { Roles } from '../auth/roles.decorator.js'
import { RolesGuard } from '../auth/roles.guard.js'
import { ApiException } from '../common/api-exception.js'
import { UserRole } from '../generated/prisma/enums.js'
import { CreateUserDto } from './dto/create-user.dto.js'
import { ListUsersQueryDto } from './dto/list-users-query.dto.js'
import { UpdateUserDto } from './dto/update-user.dto.js'
import { UsersService } from './users.service.js'
import type { UserListResponse, UserSummary } from './users.types.js'

/**
 * Administrative user management.
 *
 * The whole controller is Admin-only, enforced by `RolesGuard` after `AccessTokenGuard`,
 * so an Editor receives a uniform 403 before any company or existence query runs. Hiding
 * the navigation item is presentation only; this is the rule.
 */
@Controller('users')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  async list(
    @Req() request: AuthenticatedRequest,
    @Query() query: ListUsersQueryDto,
  ): Promise<UserListResponse> {
    return this.users.list(this.actorCompanyId(request), query)
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Req() request: AuthenticatedRequest,
    @Body() input: CreateUserDto,
  ): Promise<UserSummary> {
    return this.users.create(this.auditContext(request), input)
  }

  @Patch(':id')
  async update(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() input: UpdateUserDto,
  ): Promise<UserSummary> {
    return this.users.update(this.auditContext(request), id, input)
  }

  private actorCompanyId(request: AuthenticatedRequest): string {
    const companyId = request.currentActor?.companyId
    if (!companyId) {
      throw this.invalidAccessToken()
    }
    return companyId
  }

  private auditContext(request: AuthenticatedRequest): AuditContext {
    const actor = request.currentActor
    if (!actor) {
      throw this.invalidAccessToken()
    }
    return {
      actorId: actor.id,
      companyId: actor.companyId,
      requestId: request.requestId ?? null,
    }
  }

  private invalidAccessToken(): ApiException {
    return new ApiException(
      HttpStatus.UNAUTHORIZED,
      'INVALID_ACCESS_TOKEN',
      'Invalid access token.',
    )
  }
}
