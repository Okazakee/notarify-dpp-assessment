import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { AuthProvider } from './auth-context'
import './globals.css'

export const metadata: Metadata = {
  title: 'Notarify',
  description: 'Notarify authenticated workspace',
}

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  )
}
