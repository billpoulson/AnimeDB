import { test, expect, Page } from '@playwright/test';

interface MockPeer {
  id: string;
  name: string;
  url: string;
  instance_id: string | null;
  last_seen: string | null;
  created_at: string;
}

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

async function mockPeersPageWithMutableState(
  page: Page,
  opts?: {
    postPeerHandler?: (body: any) => { status: number; json: any };
    connectHandler?: (body: any) => { status: number; json: any };
  },
) {
  const peers: MockPeer[] = [];

  await mockAuth(page);

  await page.route('**/api/networking', async (route) => {
    await route.fulfill({
      json: {
        instanceId: 'test-instance-id',
        instanceName: 'TestNode',
        externalUrl: 'http://test.local:3000',
        upnp: { active: true, externalIp: '1.2.3.4', error: null },
      },
    });
  });

  await page.route('**/api/keys', async (route) => {
    await route.fulfill({ json: [] });
  });

  await page.route('**/api/peers/connect', async (route) => {
    const body = route.request().postDataJSON();
    if (opts?.connectHandler) {
      const result = opts.connectHandler(body);
      if (result.status === 201) {
        peers.push(result.json);
      }
      await route.fulfill({ status: result.status, json: result.json });
      return;
    }
    await route.fulfill({ status: 400, json: { error: 'Not mocked' } });
  });

  await page.route('**/api/peers', async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({ json: peers });
      return;
    }
    if (method === 'POST') {
      const body = route.request().postDataJSON();
      if (opts?.postPeerHandler) {
        const result = opts.postPeerHandler(body);
        if (result.status === 201) {
          peers.push(result.json);
        }
        await route.fulfill({ status: result.status, json: result.json });
        return;
      }
      await route.fulfill({ status: 400, json: { error: 'Not mocked' } });
      return;
    }
    await route.fallback();
  });

  return peers;
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

test.describe('Peers - Add peer form UI', () => {
  test('clicking Add peer opens the form', async ({ page }) => {
    await mockPeersPageWithMutableState(page);
    await page.goto('/peers');

    await expect(page.getByText('Connect to a peer')).not.toBeVisible();
    await page.getByRole('button', { name: 'Add peer' }).click();
    await expect(page.getByText('Connect to a peer')).toBeVisible();
  });

  test('cancel button hides the form', async ({ page }) => {
    await mockPeersPageWithMutableState(page);
    await page.goto('/peers');

    await page.getByRole('button', { name: 'Add peer' }).click();
    await expect(page.getByText('Connect to a peer')).toBeVisible();

    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText('Connect to a peer')).not.toBeVisible();
  });

  test('shows manual fields when details section is expanded', async ({ page }) => {
    await mockPeersPageWithMutableState(page);
    await page.goto('/peers');

    await page.getByRole('button', { name: 'Add peer' }).click();

    await expect(page.getByPlaceholder("Bob's AnimeDB")).not.toBeVisible();

    await page.getByText('Or enter details manually').click();

    await expect(page.getByPlaceholder("Bob's AnimeDB")).toBeVisible();
    await expect(page.getByPlaceholder('http://1.2.3.4:3000')).toBeVisible();
    await expect(page.getByPlaceholder('adb_...')).toBeVisible();
  });
});

test.describe('Peers - Add peer validation', () => {
  test('shows error when submitting empty form', async ({ page }) => {
    await mockPeersPageWithMutableState(page);
    await page.goto('/peers');

    await page.getByRole('button', { name: 'Add peer' }).click();
    await page.getByRole('button', { name: 'Connect' }).click();

    await expect(page.getByText('Paste a connection string, or fill in all fields manually')).toBeVisible();
  });

  test('shows error when only some manual fields are filled', async ({ page }) => {
    await mockPeersPageWithMutableState(page);
    await page.goto('/peers');

    await page.getByRole('button', { name: 'Add peer' }).click();
    await page.getByText('Or enter details manually').click();

    await page.getByPlaceholder("Bob's AnimeDB").fill('Test Peer');
    await page.getByRole('button', { name: 'Connect' }).click();

    await expect(page.getByText('Paste a connection string, or fill in all fields manually')).toBeVisible();
  });

  test('shows server error on connection string failure', async ({ page }) => {
    await mockPeersPageWithMutableState(page, {
      connectHandler: () => ({ status: 400, json: { error: 'Cannot reach remote instance' } }),
    });
    await page.goto('/peers');

    await page.getByRole('button', { name: 'Add peer' }).click();
    await page.getByPlaceholder('Paste an adb-connect:... string').fill('adb-connect:invaliddata');
    await page.getByRole('button', { name: 'Connect' }).click();

    await expect(page.getByText('Cannot reach remote instance')).toBeVisible();
  });

  test('shows server error on manual peer add failure', async ({ page }) => {
    await mockPeersPageWithMutableState(page, {
      postPeerHandler: () => ({ status: 400, json: { error: 'Invalid API key (401 from remote)' } }),
    });
    await page.goto('/peers');

    await page.getByRole('button', { name: 'Add peer' }).click();
    await page.getByText('Or enter details manually').click();

    await page.getByPlaceholder("Bob's AnimeDB").fill('Peer');
    await page.getByPlaceholder('http://1.2.3.4:3000').fill('http://example.com:3000');
    await page.getByPlaceholder('adb_...').fill('adb_wrongkey');
    await page.getByRole('button', { name: 'Connect' }).click();

    await expect(page.getByText('Invalid API key (401 from remote)')).toBeVisible();
  });
});

test.describe('Peers - Add peer via manual form', () => {
  test('adds peer with manual fields and shows it in the list', async ({ page }) => {
    await mockPeersPageWithMutableState(page, {
      postPeerHandler: (body) => ({
        status: 201,
        json: {
          id: 'peer-1',
          name: body.name,
          url: body.url,
          instance_id: 'remote-uuid',
          last_seen: new Date().toISOString(),
          created_at: new Date().toISOString(),
        },
      }),
    });
    await page.goto('/peers');

    await page.getByRole('button', { name: 'Add peer' }).click();
    await page.getByText('Or enter details manually').click();

    await page.getByPlaceholder("Bob's AnimeDB").fill('Alice Node');
    await page.getByPlaceholder('http://1.2.3.4:3000').fill('http://192.168.1.50:3000');
    await page.getByPlaceholder('adb_...').fill('adb_testkey123');
    await page.getByRole('button', { name: 'Connect' }).click();

    await expect(page.getByText('Connect to a peer')).not.toBeVisible();
    await expect(page.getByText('Alice Node')).toBeVisible();
  });

  test('form closes and clears after successful add', async ({ page }) => {
    await mockPeersPageWithMutableState(page, {
      postPeerHandler: (body) => ({
        status: 201,
        json: {
          id: 'peer-2',
          name: body.name,
          url: body.url,
          instance_id: null,
          last_seen: null,
          created_at: new Date().toISOString(),
        },
      }),
    });
    await page.goto('/peers');

    await page.getByRole('button', { name: 'Add peer' }).click();
    await page.getByText('Or enter details manually').click();

    await page.getByPlaceholder("Bob's AnimeDB").fill('TestPeer');
    await page.getByPlaceholder('http://1.2.3.4:3000').fill('http://10.0.0.1:3000');
    await page.getByPlaceholder('adb_...').fill('adb_key');
    await page.getByRole('button', { name: 'Connect' }).click();

    await expect(page.getByText('Connect to a peer')).not.toBeVisible();

    await page.getByRole('button', { name: 'Add peer' }).click();
    await page.getByText('Or enter details manually').click();
    await expect(page.getByPlaceholder("Bob's AnimeDB")).toHaveValue('');
    await expect(page.getByPlaceholder('http://1.2.3.4:3000')).toHaveValue('');
    await expect(page.getByPlaceholder('adb_...')).toHaveValue('');
  });
});

test.describe('Peers - Add peer via connection string', () => {
  test('adds peer with connection string and shows it in the list', async ({ page }) => {
    await mockPeersPageWithMutableState(page, {
      connectHandler: () => ({
        status: 201,
        json: {
          id: 'peer-cs-1',
          name: 'RemoteNode',
          url: 'http://5.6.7.8:3000',
          instance_id: 'remote-id-cs',
          last_seen: new Date().toISOString(),
          created_at: new Date().toISOString(),
        },
      }),
    });
    await page.goto('/peers');

    const connStr = `adb-connect:${btoa(JSON.stringify({ url: 'http://5.6.7.8:3000', name: 'RemoteNode', key: 'adb_key123' }))}`;

    await page.getByRole('button', { name: 'Add peer' }).click();
    await page.getByPlaceholder('Paste an adb-connect:... string').fill(connStr);
    await page.getByRole('button', { name: 'Connect' }).click();

    await expect(page.getByText('Connect to a peer')).not.toBeVisible();
    await expect(page.getByText('RemoteNode')).toBeVisible();
  });

  test('connection string input clears after successful connect', async ({ page }) => {
    await mockPeersPageWithMutableState(page, {
      connectHandler: () => ({
        status: 201,
        json: {
          id: 'peer-cs-2',
          name: 'ClearTest',
          url: 'http://9.9.9.9:3000',
          instance_id: null,
          last_seen: null,
          created_at: new Date().toISOString(),
        },
      }),
    });
    await page.goto('/peers');

    const connStr = `adb-connect:${btoa(JSON.stringify({ url: 'http://9.9.9.9:3000', name: 'ClearTest', key: 'adb_x' }))}`;

    await page.getByRole('button', { name: 'Add peer' }).click();
    await page.getByPlaceholder('Paste an adb-connect:... string').fill(connStr);
    await page.getByRole('button', { name: 'Connect' }).click();

    await expect(page.getByText('Connect to a peer')).not.toBeVisible();

    await page.getByRole('button', { name: 'Add peer' }).click();
    await expect(page.getByPlaceholder('Paste an adb-connect:... string')).toHaveValue('');
  });

  test('connection string takes priority over manual fields', async ({ page }) => {
    let connectCalled = false;
    let postCalled = false;

    await mockPeersPageWithMutableState(page, {
      connectHandler: () => {
        connectCalled = true;
        return {
          status: 201,
          json: {
            id: 'peer-cs-3',
            name: 'ViaConnStr',
            url: 'http://1.1.1.1:3000',
            instance_id: null,
            last_seen: null,
            created_at: new Date().toISOString(),
          },
        };
      },
      postPeerHandler: () => {
        postCalled = true;
        return { status: 201, json: {} };
      },
    });
    await page.goto('/peers');

    const connStr = `adb-connect:${btoa(JSON.stringify({ url: 'http://1.1.1.1:3000', name: 'ViaConnStr', key: 'adb_x' }))}`;

    await page.getByRole('button', { name: 'Add peer' }).click();
    await page.getByPlaceholder('Paste an adb-connect:... string').fill(connStr);

    await page.getByText('Or enter details manually').click();
    await page.getByPlaceholder("Bob's AnimeDB").fill('ShouldBeIgnored');
    await page.getByPlaceholder('http://1.2.3.4:3000').fill('http://ignored.com:3000');
    await page.getByPlaceholder('adb_...').fill('adb_ignored');

    await page.getByRole('button', { name: 'Connect' }).click();

    await expect(page.getByText('ViaConnStr')).toBeVisible();
    expect(connectCalled).toBe(true);
    expect(postCalled).toBe(false);
  });

  test('shows loading state while connecting', async ({ page }) => {
    await mockPeersPageWithMutableState(page, {
      connectHandler: () => {
        return {
          status: 201,
          json: {
            id: 'peer-cs-4',
            name: 'SlowPeer',
            url: 'http://2.2.2.2:3000',
            instance_id: null,
            last_seen: null,
            created_at: new Date().toISOString(),
          },
        };
      },
    });
    await page.goto('/peers');

    const connStr = `adb-connect:${btoa(JSON.stringify({ url: 'http://2.2.2.2:3000', name: 'SlowPeer', key: 'adb_x' }))}`;

    await page.getByRole('button', { name: 'Add peer' }).click();
    await page.getByPlaceholder('Paste an adb-connect:... string').fill(connStr);
    await page.getByRole('button', { name: 'Connect' }).click();

    await expect(page.getByText('SlowPeer')).toBeVisible();
  });
});
