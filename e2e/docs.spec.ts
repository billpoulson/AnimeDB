import { test, expect, Page } from '@playwright/test';

async function mockAuth(page: Page) {
  await page.route('**/api/auth/status', async (route) => {
    await route.fulfill({
      json: { setup: true, authenticated: true, authRequired: false },
    });
  });
}

test.describe('Docs - UPnP Troubleshooting section', () => {
  test('has UPnP Troubleshooting in table of contents', async ({ page }) => {
    await mockAuth(page);
    await page.goto('/docs');

    const tocLink = page.getByRole('link', { name: 'UPnP Troubleshooting' });
    await expect(tocLink).toBeVisible();
    await expect(tocLink).toHaveAttribute('href', '#upnp-troubleshooting');
  });

  test('contains the UPnP troubleshooting section heading and subsections', async ({ page }) => {
    await mockAuth(page);
    await page.goto('/docs');

    await expect(page.getByRole('heading', { name: 'UPnP Troubleshooting' })).toBeVisible();

    const section = page.locator('section#upnp-troubleshooting');
    await expect(section.getByText('Router does not support or has disabled UPnP')).toBeVisible();
    await expect(section.getByText('Docker networking blocks UPnP discovery')).toBeVisible();
    await expect(section.getByText('Double NAT')).toBeVisible();
    await expect(section.getByText('CGNAT (Carrier-Grade NAT)')).toBeVisible();
    await expect(section.getByText('Set the External URL manually')).toBeVisible();
    await expect(section.getByText('Firewall blocking port 3000')).toBeVisible();
    await expect(section.getByText('Still stuck?')).toBeVisible();
  });

  test('mentions Cloudflare Tunnel and Tailscale as fallback options', async ({ page }) => {
    await mockAuth(page);
    await page.goto('/docs');

    const section = page.locator('section#upnp-troubleshooting');
    await expect(section.getByText('Cloudflare Tunnel').first()).toBeVisible();
    await expect(section.getByText('Tailscale').first()).toBeVisible();
  });

  test('mentions network_mode: host for Linux Docker', async ({ page }) => {
    await mockAuth(page);
    await page.goto('/docs');

    const section = page.locator('section#upnp-troubleshooting');
    await expect(section.getByText('network_mode: host').first()).toBeVisible();
  });

  test('navigating from anchor scrolls to correct section', async ({ page }) => {
    await mockAuth(page);
    await page.goto('/docs#upnp-troubleshooting');

    await expect(page.locator('section#upnp-troubleshooting')).toBeVisible();
  });
});
