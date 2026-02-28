import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Settings from '../src/pages/Settings';
import * as api from '../src/api/client';

vi.mock('../src/api/client');

describe('UpdateCheck', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getLibraries).mockResolvedValue([]);
    vi.mocked(api.scanForFolders).mockResolvedValue([]);
    vi.mocked(api.getConfig).mockResolvedValue({
      outputFormat: 'mkv',
      plexConnected: false,
      plexUrl: null,
    });
    vi.mocked(api.getPlexSettings).mockResolvedValue({
      url: '',
      token: '',
      sectionMovies: 1,
      sectionTv: 2,
      hasToken: false,
    });
    vi.mocked(api.getAuthStatus).mockResolvedValue({
      setup: true,
      authenticated: true,
      authRequired: false,
    });
    vi.mocked(api.checkForUpdate).mockResolvedValue({
      currentSha: 'abc1234',
      remoteSha: 'def5678',
      remoteDate: '2025-01-01',
      remoteMessage: 'feat: new version',
      updateAvailable: true,
      updateInProgress: false,
    });
  });

  it('shows current and remote build info', async () => {
    render(<Settings />);

    await waitFor(() => {
      expect(screen.getByText(/abc1234/)).toBeInTheDocument();
      expect(screen.getByText(/def5678/)).toBeInTheDocument();
      expect(screen.getByText(/up to date|update available/i)).toBeInTheDocument();
    });
  });

  it('shows Install update when update available', async () => {
    render(<Settings />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /install update/i })).toBeInTheDocument();
    });
  });

  it('shows error when applyUpdate fails', async () => {
    const user = userEvent.setup();
    vi.mocked(api.applyUpdate).mockRejectedValue({
      response: { data: { error: 'Build failed' } },
    });

    render(<Settings />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /install update/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /install update/i }));

    await waitFor(() => {
      expect(screen.getByText(/build failed/i)).toBeInTheDocument();
    });
  });

  it('resets updating state when poll detects updateInProgress false', async () => {
    const user = userEvent.setup();
    vi.mocked(api.applyUpdate).mockResolvedValue({
      status: 'updating',
      message: 'Started',
    });
    vi.mocked(api.checkForUpdate)
      .mockResolvedValueOnce({
        currentSha: 'abc1234',
        remoteSha: 'def5678',
        remoteDate: '',
        remoteMessage: '',
        updateAvailable: true,
        updateInProgress: false,
      })
      .mockResolvedValue({
        currentSha: 'abc1234',
        remoteSha: 'def5678',
        remoteDate: '',
        remoteMessage: '',
        updateAvailable: true,
        updateInProgress: false,
      });

    render(<Settings />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /install update/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /install update/i }));

    await waitFor(
      () => {
        expect(screen.getByText(/update failed.*server logs/i)).toBeInTheDocument();
      },
      { timeout: 5000 }
    );
  });
});
