'use client'

import { useState } from 'react'
import { useAuth } from './auth-context'

export function LogoutButton() {
  const { logout } = useAuth()
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  async function handleLogout() {
    setIsLoggingOut(true)
    try {
      await logout()
    } catch {
      // The provider clears local auth state in finally, including when the API is unavailable.
    }
  }

  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm focus:outline-2 focus:outline-offset-2 focus:outline-primary"
      onClick={handleLogout}
      disabled={isLoggingOut}
    >
      {isLoggingOut ? 'Signing out...' : 'Sign out'}
    </button>
  )
}
