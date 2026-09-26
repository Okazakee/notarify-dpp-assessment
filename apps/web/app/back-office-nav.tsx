'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from './auth-context'
import { LogoutButton } from './logout-button'

/**
 * The shared back-office navigation.
 *
 * It exists so the six destinations do not drift between pages, and it reflects the
 * recorded permission model rather than defining it: Users and Settings are Admin
 * destinations, so an Editor is not shown them. Hiding a link is presentation only — every
 * Admin route is refused by the API's guard chain, which is the authoritative rule.
 */
const DESTINATIONS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/products', label: 'Products' },
  { href: '/passports', label: 'Product Passports' },
  { href: '/analytics', label: 'Analytics' },
] as const

const ADMIN_DESTINATIONS = [
  { href: '/users', label: 'Users' },
  { href: '/settings', label: 'Settings' },
] as const

export function BackOfficeNav() {
  const pathname = usePathname()
  const { user } = useAuth()
  const destinations =
    user?.role === 'ADMIN' ? [...DESTINATIONS, ...ADMIN_DESTINATIONS] : DESTINATIONS

  return (
    <nav className="flex flex-wrap items-center gap-1" aria-label="Back office">
      {destinations.map((destination) => {
        const current =
          pathname === destination.href || pathname?.startsWith(`${destination.href}/`)
        return (
          <Link
            key={destination.href}
            href={destination.href}
            aria-current={current === true ? 'page' : undefined}
            className={`btn btn-sm focus:outline-2 focus:outline-offset-2 focus:outline-primary ${
              current === true ? 'btn-primary' : 'btn-ghost'
            }`}
          >
            {destination.label}
          </Link>
        )
      })}
      <Link
        href="/"
        className="btn btn-ghost btn-sm focus:outline-2 focus:outline-offset-2 focus:outline-primary"
      >
        Workspace
      </Link>
      <LogoutButton />
    </nav>
  )
}
