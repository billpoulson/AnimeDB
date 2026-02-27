import { test, expect, Page } from '@playwright/test';

async function mockAuth(page: Page) {
  await page.route('**/api/auth/status', async (route) => {
    await route.fulfill({
      json: { setup: true, authenticated: true, authRequired: false },
    });
  });
}

function mockPeersPageApis(
  page: Page,
  networking: {
    externalUrl: string | null;
    upnp: { active: boolean; externalIp: string | null; error: string | null };
  },
) {
  return Promise.all([
    mockAuth(page),
    page.route('**/api/networking', async (route) => {
      await route.fulfill({
        json: {
          instanceId: 'test-instance-id',
          instanceName: 'TestNode',
          externalUrl: networking.externalUrl,
          upnp: networking.upnp,
        },
      });
    }),
    page.route('**/api/keys', async (route) => {
      await route.fulfill({ json: [] });
    }),
    page.route('**/api/peers', async (route) => {
      await route.fulfill({ json: [] });
    }),
  ]);
}

test.describe('Peers - UPnP error', () => {
  test('shows troubleshoot link when UPnP has an error', async ({ page }) => {
    await mockPeersPageApis(page, {
      externalUrl: null,
      upnp: { active: false, externalIp: null, error: 'Timeout' },
    });

    await page.goto('/peers');

    await expect(page.getByText('Unavailable: Timeout')).toBeVisible();
    const link = page.getByRole('link', { name: 'Troubleshoot', exact: true });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', '/docs#upnp-troubleshooting');
  });

  test('does not show troubleshoot link when UPnP is active', async ({ page }) => {
    await mockPeersPageApis(page, {
      externalUrl: 'http://1.2.3.4:3000',
      upnp: { active: true, externalIp: '1.2.3.4', error: null },
    });

    await page.goto('/peers');

    await expect(page.getByText('Active (1.2.3.4)')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Troubleshoot' })).not.toBeVisible();
  });

  test('shows "Not active" without troubleshoot link when manual URL is set', async ({ page }) => {
    await mockPeersPageApis(page, {
      externalUrl: 'http://manual.example.com:3000',
      upnp: { active: false, externalIp: null, error: null },
    });

    await page.goto('/peers');

    await expect(page.getByText('Not active (manual URL set)')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Troubleshoot' })).not.toBeVisible();
  });
});

test.describe('Peers - No external URL', () => {
  test('shows troubleshooting guide link when no external URL is detected', async ({ page }) => {
    await mockPeersPageApis(page, {
      externalUrl: null,
      upnp: { active: false, externalIp: null, error: 'Gateway timeout' },
    });

    await page.goto('/peers');

    const warning = page.getByText('No external URL detected');
    await expect(warning).toBeVisible();

    const link = page.getByRole('link', { name: 'See troubleshooting guide' });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', '/docs#upnp-troubleshooting');
  });

  test('does not show no-URL warning when external URL exists', async ({ page }) => {
    await mockPeersPageApis(page, {
      externalUrl: 'http://1.2.3.4:3000',
      upnp: { active: true, externalIp: '1.2.3.4', error: null },
    });

    await page.goto('/peers');

    await expect(page.getByText('No external URL detected')).not.toBeVisible();
    await expect(page.getByRole('link', { name: 'See troubleshooting guide' })).not.toBeVisible();
  });
});

test.describe('Peers - Troubleshoot link navigates to docs', () => {
  test('troubleshoot link navigates to docs UPnP section', async ({ page }) => {
    await mockPeersPageApis(page, {
      externalUrl: null,
      upnp: { active: false, externalIp: null, error: 'UPnP discovery failed' },
    });

    await page.goto('/peers');

    await page.getByRole('link', { name: 'Troubleshoot', exact: true }).click();

    await expect(page).toHaveURL(/\/docs#upnp-troubleshooting/);
    await expect(page.getByRole('heading', { name: 'UPnP Troubleshooting' })).toBeVisible();
  });
});
