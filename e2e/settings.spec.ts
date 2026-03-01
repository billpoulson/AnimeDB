import { test, expect } from '@playwright/test';

async function setupSettingsMocks(
  page: import('@playwright/test').Page,
  opts?: { authRequired?: boolean }
) {
  await page.route('**/api/auth/status', async (route) => {
    await route.fulfill({
      json: {
        setup: true,
        authenticated: true,
        authRequired: opts?.authRequired ?? false,
      },
    });
  });

  await page.route('**/api/libraries', async (route) => {
    await route.fulfill({ json: [] });
  });
  await page.route('**/api/libraries/scan', async (route) => {
    await route.fulfill({ json: [] });
  });
  await page.route('**/api/config', async (route) => {
    await route.fulfill({
      json: { outputFormat: 'mkv', plexConnected: false, plexUrl: null },
    });
  });
  await page.route('**/api/settings/plex', async (route) => {
    await route.fulfill({
      json: { url: '', token: '', sectionMovies: 1, sectionTv: 2, hasToken: false },
    });
  });
  await page.route('**/api/system/update-check', async (route) => {
    await route.fulfill({
      json: {
        currentSha: 'abc123',
        remoteSha: 'abc123',
        remoteMessage: '',
        remoteDate: '',
        updateAvailable: false,
        updateInProgress: false,
      },
    });
  });
}

test.describe('Settings - sidebar layout', () => {
  test('renders sidebar nav with Libraries, Integrations, Updates links', async ({ page }) => {
    await setupSettingsMocks(page);
    await page.goto('/settings');

    await expect(page.getByRole('link', { name: 'Libraries', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Integrations', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Updates', exact: true })).toBeVisible();
  });

  test('nav links have correct href for anchor navigation', async ({ page }) => {
    await setupSettingsMocks(page);
    await page.goto('/settings');

    await expect(page.getByRole('link', { name: 'Libraries' })).toHaveAttribute('href', '#libraries');
    await expect(page.getByRole('link', { name: 'Integrations' })).toHaveAttribute('href', '#integrations');
    await expect(page.getByRole('link', { name: 'Updates' })).toHaveAttribute('href', '#updates');
  });

  test('hides Security link when auth is not required', async ({ page }) => {
    await setupSettingsMocks(page, { authRequired: false });
    await page.goto('/settings');

    await expect(page.getByRole('link', { name: 'Libraries' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Security' })).not.toBeVisible();
  });

  test('shows Security link when auth is required', async ({ page }) => {
    await setupSettingsMocks(page, { authRequired: true });
    await page.goto('/settings');

    await expect(page.getByRole('link', { name: 'Security' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Security' })).toHaveAttribute('href', '#security');
  });

  test('clicking sidebar link scrolls to section', async ({ page }) => {
    await setupSettingsMocks(page);
    await page.goto('/settings');

    await page.getByRole('link', { name: 'Integrations' }).click();

    await expect(page).toHaveURL(/\/settings#integrations/);
    await expect(page.locator('#integrations')).toBeVisible();
  });

  test('hash URL loads correct section', async ({ page }) => {
    await setupSettingsMocks(page);
    await page.goto('/settings#updates');

    await expect(page).toHaveURL(/\/settings#updates/);
    await expect(page.locator('#updates')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Updates' })).toBeVisible();
  });
});
