import { test, expect } from '@playwright/test';

test.describe('Auth - First time setup', () => {
  test('shows password creation form when no password is configured', async ({ page }) => {
    await page.route('**/api/auth/status', async (route) => {
      await route.fulfill({
        json: { setup: false, authenticated: false, authRequired: true },
      });
    });

    await page.goto('/');

    await expect(page.getByText('AnimeDB')).toBeVisible();
    await expect(page.getByText('Create a password to get started')).toBeVisible();
    await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Confirm Password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create Password' })).toBeVisible();
  });

  test('does not show dashboard content before password setup', async ({ page }) => {
    await page.route('**/api/auth/status', async (route) => {
      await route.fulfill({
        json: { setup: false, authenticated: false, authRequired: true },
      });
    });

    await page.goto('/');

    await expect(page.getByText('Create a password to get started')).toBeVisible();
    await expect(page.getByText('Add Download')).not.toBeVisible();
    await expect(page.getByRole('link', { name: /dashboard/i })).not.toBeVisible();
  });

  test('validates passwords match before submitting', async ({ page }) => {
    await page.route('**/api/auth/status', async (route) => {
      await route.fulfill({
        json: { setup: false, authenticated: false, authRequired: true },
      });
    });

    await page.goto('/');

    await page.getByLabel('Password', { exact: true }).fill('test1234');
    await page.getByLabel('Confirm Password').fill('mismatch');
    await page.getByRole('button', { name: 'Create Password' }).click();

    await expect(page.getByText('Passwords do not match')).toBeVisible();
  });

  test('validates minimum password length', async ({ page }) => {
    await page.route('**/api/auth/status', async (route) => {
      await route.fulfill({
        json: { setup: false, authenticated: false, authRequired: true },
      });
    });

    await page.goto('/');

    await page.getByLabel('Password', { exact: true }).fill('ab');
    await page.getByLabel('Confirm Password').fill('ab');
    await page.getByRole('button', { name: 'Create Password' }).click();

    await expect(page.getByText('Password must be at least 4 characters')).toBeVisible();
  });

  test('submits setup and loads app on success', async ({ page }) => {
    let authSetupCalled = false;

    await page.route('**/api/auth/status', async (route) => {
      if (authSetupCalled) {
        await route.fulfill({
          json: { setup: true, authenticated: true, authRequired: true },
        });
      } else {
        await route.fulfill({
          json: { setup: false, authenticated: false, authRequired: true },
        });
      }
    });

    await page.route('**/api/auth/setup', async (route) => {
      authSetupCalled = true;
      await route.fulfill({
        json: { token: 'mock-token-123' },
      });
    });

    await page.route('**/api/downloads', async (route) => {
      await route.fulfill({ json: [] });
    });
    await page.route('**/api/config', async (route) => {
      await route.fulfill({
        json: { outputFormat: 'mkv', plexConnected: false, plexUrl: null },
      });
    });

    await page.goto('/');

    await page.getByLabel('Password', { exact: true }).fill('mypassword');
    await page.getByLabel('Confirm Password').fill('mypassword');
    await page.getByRole('button', { name: 'Create Password' }).click();

    await expect(page.getByText('Add Download')).toBeVisible();
  });
});

test.describe('Auth - Login', () => {
  test('shows login form when password exists but not authenticated', async ({ page }) => {
    await page.route('**/api/auth/status', async (route) => {
      await route.fulfill({
        json: { setup: true, authenticated: false, authRequired: true },
      });
    });

    await page.goto('/');

    await expect(page.getByText('Enter your password to continue')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByLabel('Confirm Password')).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Log In' })).toBeVisible();
  });

  test('shows error on wrong password', async ({ page }) => {
    await page.route('**/api/auth/status', async (route) => {
      await route.fulfill({
        json: { setup: true, authenticated: false, authRequired: true },
      });
    });

    await page.route('**/api/auth/login', async (route) => {
      await route.fulfill({
        status: 401,
        json: { error: 'Invalid password' },
      });
    });

    await page.goto('/');

    await page.getByLabel('Password').fill('wrongpass');
    await page.getByRole('button', { name: 'Log In' }).click();

    await expect(page.getByText('Invalid password')).toBeVisible();
  });

  test('logs in and shows dashboard on correct password', async ({ page }) => {
    let loggedIn = false;

    await page.route('**/api/auth/status', async (route) => {
      if (loggedIn) {
        await route.fulfill({
          json: { setup: true, authenticated: true, authRequired: true },
        });
      } else {
        await route.fulfill({
          json: { setup: true, authenticated: false, authRequired: true },
        });
      }
    });

    await page.route('**/api/auth/login', async (route) => {
      loggedIn = true;
      await route.fulfill({
        json: { token: 'mock-token-456' },
      });
    });

    await page.route('**/api/downloads', async (route) => {
      await route.fulfill({ json: [] });
    });
    await page.route('**/api/config', async (route) => {
      await route.fulfill({
        json: { outputFormat: 'mkv', plexConnected: false, plexUrl: null },
      });
    });

    await page.goto('/');

    await page.getByLabel('Password').fill('correctpass');
    await page.getByRole('button', { name: 'Log In' }).click();

    await expect(page.getByText('Add Download')).toBeVisible();
  });
});

test.describe('Auth - Disabled', () => {
  test('skips login and shows dashboard when auth is disabled', async ({ page }) => {
    await page.route('**/api/auth/status', async (route) => {
      await route.fulfill({
        json: { setup: false, authenticated: true, authRequired: false },
      });
    });

    await page.route('**/api/downloads', async (route) => {
      await route.fulfill({ json: [] });
    });
    await page.route('**/api/config', async (route) => {
      await route.fulfill({
        json: { outputFormat: 'mkv', plexConnected: false, plexUrl: null },
      });
    });

    await page.goto('/');

    await expect(page.getByText('Add Download')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Logout' })).not.toBeVisible();
  });
});
