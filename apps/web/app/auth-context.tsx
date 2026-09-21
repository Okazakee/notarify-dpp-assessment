'use client'

import { useRouter } from 'next/navigation'
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

export type UserRole = 'ADMIN' | 'EDITOR'

export type AuthUser = {
  id: string
  email: string
  role: UserRole
  companyId?: string
}

type AuthStatus = 'loading' | 'signed-out' | 'signed-in'

type LoginResult = {
  accessToken: string
  expiresIn: number
  user: AuthUser
}

type RefreshResult = {
  accessToken: string
  expiresIn: number
}

type AuthContextValue = {
  status: AuthStatus
  user: AuthUser | null
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  getMe: () => Promise<AuthUser>
  request: (path: string, init?: RequestInit) => Promise<Response>
}

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/$/, '')
const REQUEST_TIMEOUT_MS = 10_000

class AuthRequestError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'AuthRequestError'
    this.status = status
  }
}

function isRole(value: unknown): value is UserRole {
  return value === 'ADMIN' || value === 'EDITOR'
}

function isAuthUser(value: unknown): value is AuthUser {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.email === 'string' &&
    isRole(candidate.role) &&
    (candidate.companyId === undefined || typeof candidate.companyId === 'string')
  )
}

function isLoginResult(value: unknown): value is LoginResult {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.accessToken === 'string' &&
    typeof candidate.expiresIn === 'number' &&
    isAuthUser(candidate.user)
  )
}

function isRefreshResult(value: unknown): value is RefreshResult {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const candidate = value as Record<string, unknown>
  return typeof candidate.accessToken === 'string' && typeof candidate.expiresIn === 'number'
}

async function parseJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new AuthRequestError(408, 'The request timed out.')
    }
    throw new AuthRequestError(0, 'The API is unavailable.')
  } finally {
    window.clearTimeout(timeout)
  }
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const tokenRef = useRef<string | null>(null)
  const refreshPromiseRef = useRef<Promise<string> | null>(null)
  const restorePromiseRef = useRef<Promise<void> | null>(null)
  const restoreMountedRef = useRef(false)
  const sessionGenerationRef = useRef(0)
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [user, setUser] = useState<AuthUser | null>(null)

  const clearSession = useCallback(
    (redirect: boolean) => {
      sessionGenerationRef.current += 1
      tokenRef.current = null
      setUser(null)
      setStatus('signed-out')
      if (redirect) {
        router.replace('/login')
      }
    },
    [router],
  )

  const setSession = useCallback((accessToken: string, authenticatedUser: AuthUser) => {
    sessionGenerationRef.current += 1
    tokenRef.current = accessToken
    setUser(authenticatedUser)
    setStatus('signed-in')
  }, [])

  const refreshAccessToken = useCallback(async (): Promise<string> => {
    const existingRefresh = refreshPromiseRef.current
    if (existingRefresh !== null) {
      return existingRefresh
    }

    const generation = sessionGenerationRef.current
    const refreshPromise = (async () => {
      try {
        const response = await fetchWithTimeout(`${API_URL}/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
        })
        if (!response.ok) {
          throw new AuthRequestError(response.status, 'Unable to refresh the session.')
        }

        const payload = await parseJson(response)
        if (!isRefreshResult(payload)) {
          throw new AuthRequestError(502, 'The API returned an invalid refresh response.')
        }
        if (sessionGenerationRef.current !== generation) {
          throw new AuthRequestError(401, 'The session was cleared while refreshing.')
        }

        tokenRef.current = payload.accessToken
        return payload.accessToken
      } catch (error) {
        if (sessionGenerationRef.current === generation) {
          clearSession(true)
        }
        throw error
      }
    })()

    refreshPromiseRef.current = refreshPromise
    void refreshPromise.then(
      () => {
        if (refreshPromiseRef.current === refreshPromise) {
          refreshPromiseRef.current = null
        }
      },
      () => {
        if (refreshPromiseRef.current === refreshPromise) {
          refreshPromiseRef.current = null
        }
      },
    )
    return refreshPromise
  }, [clearSession])

  const requestWithAccessToken = useCallback(
    async (path: string, init: RequestInit = {}, hasRetried = false): Promise<Response> => {
      const isAuthEndpoint = path === '/auth/login' || path === '/auth/refresh'
      const accessToken = tokenRef.current
      if (!isAuthEndpoint && accessToken === null) {
        throw new AuthRequestError(401, 'Not authenticated.')
      }

      const headers = new Headers(init.headers)
      if (!isAuthEndpoint && accessToken !== null) {
        headers.set('Authorization', `Bearer ${accessToken}`)
      }
      const response = await fetchWithTimeout(`${API_URL}${path}`, { ...init, headers })
      if (isAuthEndpoint || response.status !== 401 || hasRetried) {
        return response
      }

      if (tokenRef.current !== accessToken) {
        return requestWithAccessToken(path, init, true)
      }

      // Cross-tab refresh coordination is a follow-up; this promise only coordinates one tab.
      await refreshAccessToken()
      return requestWithAccessToken(path, init, true)
    },
    [refreshAccessToken],
  )

  const getMe = useCallback(async (): Promise<AuthUser> => {
    const response = await requestWithAccessToken('/auth/me')
    if (response.status === 401) {
      clearSession(true)
      throw new AuthRequestError(401, 'Not authenticated.')
    }
    if (!response.ok) {
      throw new AuthRequestError(response.status, 'Unable to load the signed-in user.')
    }

    const payload = await parseJson(response)
    if (!isAuthUser(payload)) {
      throw new AuthRequestError(502, 'The API returned an invalid user.')
    }
    setUser(payload)
    return payload
  }, [clearSession, requestWithAccessToken])

  useEffect(() => {
    restoreMountedRef.current = true

    async function restoreSession() {
      try {
        const refreshResponse = await fetchWithTimeout(`${API_URL}/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
        })
        if (refreshResponse.status === 401) {
          if (restoreMountedRef.current) {
            clearSession(true)
          }
          return
        }
        if (!refreshResponse.ok) {
          if (restoreMountedRef.current) {
            clearSession(false)
          }
          return
        }

        const refreshPayload = await parseJson(refreshResponse)
        if (!isRefreshResult(refreshPayload)) {
          if (restoreMountedRef.current) {
            clearSession(false)
          }
          return
        }

        const meResponse = await fetchWithTimeout(`${API_URL}/auth/me`, {
          headers: { Authorization: `Bearer ${refreshPayload.accessToken}` },
        })
        if (meResponse.status === 401) {
          if (restoreMountedRef.current) {
            clearSession(true)
          }
          return
        }
        if (!meResponse.ok) {
          if (restoreMountedRef.current) {
            clearSession(false)
          }
          return
        }

        const mePayload = await parseJson(meResponse)
        if (restoreMountedRef.current && isAuthUser(mePayload)) {
          setSession(refreshPayload.accessToken, mePayload)
        } else if (restoreMountedRef.current) {
          clearSession(false)
        }
      } catch {
        if (restoreMountedRef.current) {
          clearSession(false)
        }
      }
    }

    if (restorePromiseRef.current === null) {
      restorePromiseRef.current = restoreSession()
    }
    return () => {
      restoreMountedRef.current = false
    }
  }, [clearSession, setSession])

  const login = useCallback(
    async (email: string, password: string) => {
      const response = await fetchWithTimeout(`${API_URL}/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const payload = await parseJson(response)
      if (response.status === 401) {
        clearSession(true)
      }
      if (!response.ok || !isLoginResult(payload)) {
        throw new AuthRequestError(response.status, 'Unable to sign in with those credentials.')
      }
      setSession(payload.accessToken, payload.user)
    },
    [clearSession, setSession],
  )

  const logout = useCallback(async () => {
    try {
      await fetchWithTimeout(`${API_URL}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      })
    } finally {
      clearSession(true)
    }
  }, [clearSession])

  const contextValue = useMemo(
    () => ({ status, user, login, logout, getMe, request: requestWithAccessToken }),
    [getMe, login, logout, requestWithAccessToken, status, user],
  )

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (context === null) {
    throw new Error('useAuth must be used inside AuthProvider')
  }
  return context
}
