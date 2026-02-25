import { test, expect, Page } from '@playwright/test';

interface MockDownload {
  id: string;
  url: string;
  title: string | null;
  category: string;
  season: number | null;
  episode: number | null;
  status: string;
  progress: number;
  file_path: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

async function setupApiMocks(page: Page) {
  const downloads: MockDownload[] = [];

  await page.route('**/api/downloads', async (route) => {
    const method = route.request().method();

    if (method === 'GET') {
      await route.fulfill({ json: downloads });
      return;
    }

    if (method === 'POST') {
      const body = route.request().postDataJSON();
      const dl: MockDownload = {
        id: `mock-${Date.now()}`,
        url: body.url,
        title: body.title || null,
        category: body.category || 'other',
        season: body.season || null,
        episode: body.episode || null,
        status: 'queued',
        progress: 0,
        file_path: null,
        error: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      downloads.push(dl);
      await route.fulfill({ status: 201, json: { id: dl.id, status: 'queued' } });
      return;
    }

    await route.fallback();
  });

  await page.route('**/api/downloads/*', async (route) => {
    const method = route.request().method();
    const url = route.request().url();
    const id = url.split('/api/downloads/')[1];

    if (method === 'GET') {
      const dl = downloads.find((d) => d.id === id);
      if (dl) {
        await route.fulfill({ json: dl });
      } else {
        await route.fulfill({ status: 404, json: { error: 'Not found' } });
      }
      return;
    }

    if (method === 'DELETE') {
      const idx = downloads.findIndex((d) => d.id === id);
      if (idx >= 0) {
        downloads.splice(idx, 1);
        await route.fulfill({ status: 204 });
      } else {
        await route.fulfill({ status: 404, json: { error: 'Not found' } });
      }
      return;
    }

    await route.fallback();
  });

  await page.route('**/api/config', async (route) => {
    await route.fulfill({
      json: { outputFormat: 'mkv', plexConnected: false, plexUrl: null },
    });
  });

  return downloads;
}

test.describe('Dashboard', () => {
  test('loads with download form visible', async ({ page }) => {
    await setupApiMocks(page);
    await page.goto('/');

    await expect(page.getByText('Add Download')).toBeVisible();
    await expect(page.getByLabel('YouTube URL')).toBeVisible();
    await expect(page.getByLabel('Category')).toBeVisible();
    await expect(page.getByRole('button', { name: /add to queue/i })).toBeVisible();
  });

  test('submits a download and shows it in the list', async ({ page }) => {
    await setupApiMocks(page);
    await page.goto('/');

    await page.getByLabel('YouTube URL').fill('https://youtube.com/watch?v=e2etest');
    await page.getByLabel('Category').selectOption('movies');
    await page.getByRole('button', { name: /add to queue/i }).click();

    await expect(page.getByText('queued')).toBeVisible();
    await expect(page.getByText('https://youtube.com/watch?v=e2etest').first()).toBeVisible();
  });

  test('shows TV-specific fields when TV category selected', async ({ page }) => {
    await setupApiMocks(page);
    await page.goto('/');

    await expect(page.getByLabel('Season')).not.toBeVisible();
    await expect(page.getByLabel('Episode')).not.toBeVisible();

    await page.getByLabel('Category').selectOption('tv');

    await expect(page.getByLabel('Season')).toBeVisible();
    await expect(page.getByLabel('Episode')).toBeVisible();
  });

  test('clears form after successful submit', async ({ page }) => {
    await setupApiMocks(page);
    await page.goto('/');

    const urlInput = page.getByLabel('YouTube URL');
    await urlInput.fill('https://youtube.com/watch?v=cleartest');
    await page.getByRole('button', { name: /add to queue/i }).click();

    await expect(urlInput).toHaveValue('');
  });
});

test.describe('Navigation', () => {
  test('navigates between Dashboard and Library', async ({ page }) => {
    await setupApiMocks(page);
    await page.goto('/');

    await expect(page.getByText('Add Download')).toBeVisible();

    await page.getByRole('link', { name: /library/i }).click();
    await expect(page.getByText('No media in library yet')).toBeVisible();

    await page.getByRole('link', { name: /dashboard/i }).click();
    await expect(page.getByText('Add Download')).toBeVisible();
  });
});

test.describe('Library', () => {
  test('shows empty state when no completed downloads', async ({ page }) => {
    await setupApiMocks(page);
    await page.goto('/library');

    await expect(page.getByText('No media in library yet')).toBeVisible();
    await expect(
      page.getByText('Add a YouTube URL from the Dashboard to get started.')
    ).toBeVisible();
  });

  test('shows completed downloads in table', async ({ page }) => {
    await page.route('**/api/downloads', async (route) => {
      await route.fulfill({
        json: [
          {
            id: 'lib-1',
            url: 'https://youtube.com/watch?v=lib',
            title: 'My Anime Movie',
            category: 'movies',
            season: null,
            episode: null,
            status: 'completed',
            progress: 100,
            file_path: '/media/Movies/My Anime Movie/My Anime Movie.mkv',
            error: null,
            created_at: '2025-06-15T10:00:00Z',
            updated_at: '2025-06-15T10:05:00Z',
          },
        ],
      });
    });
    await page.route('**/api/config', async (route) => {
      await route.fulfill({
        json: { outputFormat: 'mkv', plexConnected: false, plexUrl: null },
      });
    });

    await page.goto('/library');

    await expect(page.getByText('Media Library')).toBeVisible();
    await expect(page.getByRole('cell', { name: 'My Anime Movie', exact: true })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'movies', exact: true })).toBeVisible();
  });
});
