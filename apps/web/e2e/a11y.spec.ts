import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Guards the product's headline differentiator: real WCAG 2.1 AA accessibility.
 * Runs axe-core against the public marketing page (our own markup — sign-in is
 * a third-party Clerk widget, excluded here). Extend to authenticated pages
 * once a test user/session is wired up.
 */
test.describe('acessibilidade — WCAG 2.1 AA', () => {
  test('landing page não tem violações de acessibilidade', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test('landing page é navegável e tem um só h1', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    // Skip-link + main landmark present for keyboard/screen-reader users.
    await expect(page.locator('#main-content')).toBeAttached();
  });
});
