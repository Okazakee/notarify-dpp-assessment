import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { ApiException } from '../common/api-exception.js'
import type { CookieOptions, HttpResponse, ParsedRequest } from '../common/http-types.js'
import type { AppEnvironment } from '../config/configuration.js'
import type { AuthenticatedRequest } from './access-token.guard.js'
import { AccessTokenGuard } from './access-token.guard.js'
import { REFRESH_COOKIE_NAME, REFRESH_SESSION_LIFETIME_MS } from './auth.constants.js'
import { EmptyBodyDto, LoginDto } from './auth.dto.js'
import { AuthService } from './auth.service.js'

type Request = ParsedRequest
type Response = HttpResponse

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService<AppEnvironment, true>,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{
    accessToken: string
    expiresIn: number
    user: { id: string; email: string; role: string }
  }> {
    this.enforceOrigin(request)
    const result = await this.authService.login(body.email, body.password, request.requestId)
    this.setRefreshCookie(response, result.refreshToken)
    return {
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
      user: result.user,
    }
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body() _body: EmptyBodyDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ accessToken: string; expiresIn: number }> {
    this.enforceOrigin(request)
    const refreshToken = this.readRefreshCookie(request)
    const result = await this.authService.refresh(refreshToken)
    this.setRefreshCookie(response, result.refreshToken)
    return {
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
    }
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Body() _body: EmptyBodyDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    this.enforceOrigin(request)
    await this.authService.logout(this.readOptionalRefreshCookie(request))
    response.clearCookie(REFRESH_COOKIE_NAME, this.cookieOptions())
  }

  @Get('me')
  @UseGuards(AccessTokenGuard)
  async me(
    @Req() request: AuthenticatedRequest,
  ): Promise<{ id: string; email: string; role: string; companyId: string }> {
    const actor = request.currentActor
    if (!actor) {
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        'INVALID_ACCESS_TOKEN',
        'Invalid access token.',
      )
    }
    return actor
  }

  private enforceOrigin(request: Request): void {
    const origin = request.headers.origin
    // Origin is optional for non-browser clients and command-line callers; when supplied it must match exactly.
    if (origin === undefined) {
      return
    }

    if (origin !== this.config.getOrThrow<string>('CORS_ORIGIN')) {
      throw new ApiException(HttpStatus.FORBIDDEN, 'INVALID_ORIGIN', 'Invalid request origin.')
    }
  }

  private readRefreshCookie(request: Request): string {
    const refreshToken = this.readOptionalRefreshCookie(request)
    if (refreshToken === undefined) {
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        'INVALID_REFRESH_TOKEN',
        'Invalid refresh token.',
      )
    }
    return refreshToken
  }

  private readOptionalRefreshCookie(request: Request): string | undefined {
    let refreshToken = request.cookies?.[REFRESH_COOKIE_NAME]
    if (typeof refreshToken !== 'string' || refreshToken.length === 0) {
      const header = request.headers.cookie
      if (typeof header === 'string') {
        const cookie = header
          .split(';')
          .map((part) => part.trim())
          .find((part) => part.startsWith(`${REFRESH_COOKIE_NAME}=`))
        refreshToken = cookie?.slice(`${REFRESH_COOKIE_NAME}=`.length)
      }
    }
    return typeof refreshToken === 'string' && refreshToken.length > 0 ? refreshToken : undefined
  }

  private setRefreshCookie(response: Response, value: string): void {
    response.cookie(REFRESH_COOKIE_NAME, value, this.cookieOptions())
  }

  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      maxAge: REFRESH_SESSION_LIFETIME_MS,
      path: '/auth',
      sameSite: 'lax',
      secure: this.config.get<string>('NODE_ENV') === 'production',
    }
  }
}
