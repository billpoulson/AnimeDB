import { test, expect } from '@playwright/test';

async function setupPlexMocks(page: import('@playwright/test').Page) {
  await page.route('**/api/auth/status', async (route) => {
    await route.fulfill({
      json: { setup: true, authenticated: true, authRequired: false },
    });
  });

  await page.route('**/api/downloads', async (route) => {
    await route.fulfill({ json: [] });
  });
  await page.route('**/api/libraries', async (route) => {
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
        currentSha: 'test',
        remoteSha: 'test',
        remoteMessage: '',
        remoteDate: '',
        updateAvailable: false,
        updateInProgress: false,
      },
    });
  });
  await page.route('**/api/libraries/scan', async (route) => {
    await route.fulfill({ json: [] });
  });
}

test.describe('Plex Link flow', () => {
  test('shows Link with Plex and starts PIN flow', async ({ page }) => {
    await setupPlexMocks(page);

    await page.route('**/api/settings/plex/pin', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          json: {
            authUrl: 'https://app.plex.tv/auth#?code=TEST123',
            code: 'TEST123',
            pinId: 999,
          },
        });
      } else {
        await route.fallback();
      }
    });

    await page.route('**/api/settings/plex/pin/*', async (route) => {
      await route.fulfill({
        json: { token: null, expiresAt: null },
      });
    });

    await page.goto('/settings');

    await expect(page.getByRole('button', { name: /link with plex/i })).toBeVisible();

    const [popup] = await Promise.all([
      page.waitForEvent('popup'),
      page.getByRole('button', { name: /link with plex/i }).click(),
    ]);

    await expect(popup).toHaveURL(/app\.plex\.tv\/auth/);
    await popup.close();

    await expect(page.locator('code').filter({ hasText: 'TEST123' })).toBeVisible();
    await expect(page.getByText(/waiting for authorization/i)).toBeVisible();
  });

  test('completes full flow when poll returns token', async ({ page }) => {
    await setupPlexMocks(page);

    let pollCount = 0;

    await page.route(/\/api\/settings\/plex\/pin\/\d+/, async (route) => {
      pollCount++;
      if (pollCount >= 2) {
        await route.fulfill({
          json: { token: 'auth-token-xyz', expiresAt: '2025-01-01' },
        });
      } else {
        await route.fulfill({
          json: { token: null, expiresAt: null },
        });
      }
    });

    await page.route('**/api/settings/plex/pin', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          json: {
            authUrl: 'https://app.plex.tv/auth#?code=ABC',
            code: 'ABC',
            pinId: 1,
          },
        });
      } else {
        await route.fallback();
      }
    });

    await page.route('**/api/settings/plex/servers*', async (route) => {
      await route.fulfill({
        json: {
          servers: [{ name: 'My Plex Server', uri: 'http://192.168.1.50:32400' }],
        },
      });
    });

    await page.route('**/api/settings/plex', async (route) => {
      if (route.request().method() === 'PUT') {
        await route.fulfill({
          json: {
            url: 'http://192.168.1.50:32400',
            token: 'xxx',
            sectionMovies: 1,
            sectionTv: 2,
            hasToken: true,
          },
        });
      } else {
        await route.fulfill({
          json: { url: '', token: '', sectionMovies: 1, sectionTv: 2, hasToken: false },
        });
      }
    });

    await page.goto('/settings');

    const [popup] = await Promise.all([
      page.waitForEvent('popup'),
      page.getByRole('button', { name: /link with plex/i }).click(),
    ]);
    await popup.close();

    await expect(page.locator('code').filter({ hasText: 'ABC' })).toBeVisible();

    await expect(page.getByText(/authorized/i)).toBeVisible({ timeout: 5000 });
    const completeBtn = page.getByRole('button', { name: /complete setup/i });
    await expect(completeBtn).toBeVisible({ timeout: 5000 });
    await expect(completeBtn).toBeEnabled({ timeout: 2000 });

    const putPromise = page.waitForRequest(
      (req) => req.method() === 'PUT' && req.url().includes('/api/settings/plex')
    );

    await completeBtn.click();

    const putRequest = await putPromise;
    const body = putRequest.postDataJSON();
    expect(body).toMatchObject({
      url: 'http://192.168.1.50:32400',
      token: 'auth-token-xyz',
    });
  });

  test('does not pass forwardUrl to createPlexPin (avoids redirect logout)', async ({ page }) => {
    await setupPlexMocks(page);

    let createPinBody: unknown = null;

    await page.route('**/api/settings/plex/pin', async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        createPinBody = body;
        await route.fulfill({
          json: {
            authUrl: 'https://app.plex.tv/auth#?code=X',
            code: 'X',
            pinId: 1,
          },
        });
      } else {
        await route.fallback();
      }
    });

    await page.route('**/api/settings/plex/pin/1*', async (route) => {
      await route.fulfill({ json: { token: null } });
    });

    await page.goto('/settings');

    await page.getByRole('button', { name: /link with plex/i }).click();

    await page.waitForTimeout(500);

    expect(createPinBody).toBeDefined();
    expect(createPinBody).not.toHaveProperty('forwardUrl');
  });
});
