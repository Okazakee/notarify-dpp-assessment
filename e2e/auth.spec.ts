import { expect, test } from '@playwright/test'
import { E2E_EMAIL, E2E_PASSWORD } from './global-setup.ts'

async function signIn(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/login')
  await page.fill('#email', E2E_EMAIL)
  await page.fill('#password', E2E_PASSWORD)
  await page.click('button[type="submit"]')
  await expect(page).toHaveURL(/localhost:\d+\/(\?.*)?$/)
  await expect(page.getByText(E2E_EMAIL)).toBeVisible()
}

test.describe('authentication', () => {
  test('signs in and shows the authenticated workspace', async ({ page }) => {
    await signIn(page)
    await expect(page.getByText('EDITOR')).toBeVisible()
  })

  test('restores the session after a reload without web storage', async ({ page }) => {
    await signIn(page)
    await page.goto('/dashboard')
    await expect(page.getByText(E2E_EMAIL)).toBeVisible()

    await page.reload()
    await expect(page.getByText(E2E_EMAIL)).toBeVisible()

    const storage = await page.evaluate(() => ({
      local: Object.keys(localStorage).length,
      session: Object.keys(sessionStorage).length,
      cookie: document.cookie,
    }))
    expect(storage.local).toBe(0)
    expect(storage.session).toBe(0)
    expect(storage.cookie).toBe('')
  })

  test('refreshes an expired access token at runtime and retries once', async ({ page }) => {
    await signIn(page)

    const refreshCalls: number[] = []
    page.on('response', (response) => {
      if (response.url().endsWith('/auth/refresh')) refreshCalls.push(response.status())
    })

    // The access token lives 3 seconds in this configuration; wait it out, then
    // ask for protected data. Exactly one refresh must happen and the call must
    // still succeed through the automatic retry.
    await page.waitForTimeout(4000)
    await page.goto('/dashboard')
    await expect(page.getByText(E2E_EMAIL)).toBeVisible()

    expect(refreshCalls.filter((status) => status === 200)).toHaveLength(1)
  })

  test('logs out, and protected routes then redirect to login', async ({ page }) => {
    await signIn(page)

    await page
      .getByRole('button', { name: /sign out/i })
      .first()
      .click()
    await expect(page).toHaveURL(/\/login$/)

    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login$/)
  })
})
