import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Settings from '../src/pages/Settings';
import * as api from '../src/api/client';

vi.mock('../src/api/client');

describe('PlexIntegration', () => {
  const mockOpen = vi.fn();

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
    vi.mocked(api.checkForUpdate).mockResolvedValue({
      currentSha: 'abc123',
      remoteSha: 'abc123',
      remoteMessage: '',
      updateAvailable: false,
      updateInProgress: false,
    });
    vi.mocked(api.getAuthStatus).mockResolvedValue({
      setup: true,
      authenticated: true,
      authRequired: false,
    });
    Object.defineProperty(window, 'open', { value: mockOpen, writable: true });
  });

  it('shows Link with Plex button when not configured', async () => {
    render(<Settings />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /link with plex/i })).toBeInTheDocument();
    });
  });

  it('starts PIN flow when Link with Plex is clicked', async () => {
    const user = userEvent.setup();
    vi.mocked(api.createPlexPin).mockResolvedValue({
      authUrl: 'https://app.plex.tv/auth#?code=XYZ',
      code: 'XYZ',
      pinId: 999,
    });
    vi.mocked(api.pollPlexPin).mockResolvedValue({ token: null });

    render(<Settings />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /link with plex/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /link with plex/i }));

    await waitFor(() => {
      expect(api.createPlexPin).toHaveBeenCalled();
      expect(mockOpen).toHaveBeenCalledWith('https://app.plex.tv/auth#?code=XYZ', '_blank', 'noopener,noreferrer');
    });

    expect(screen.getByText('XYZ')).toBeInTheDocument();
    expect(screen.getByText(/waiting for authorization/i)).toBeInTheDocument();
  });

  it('shows server picker when token received and completes setup', async () => {
    const user = userEvent.setup();
    vi.mocked(api.createPlexPin).mockResolvedValue({
      authUrl: 'https://app.plex.tv/auth#?code=ABC',
      code: 'ABC',
      pinId: 1,
    });
    vi.mocked(api.pollPlexPin).mockResolvedValue({ token: 'auth-token', expiresAt: '2025-01-01' });
    vi.mocked(api.getPlexServers).mockResolvedValue([
      { name: 'My Server', uri: 'http://192.168.1.50:32400' },
    ]);
    vi.mocked(api.savePlexSettings).mockResolvedValue({
      url: 'http://192.168.1.50:32400',
      token: 'xxx',
      sectionMovies: 1,
      sectionTv: 2,
      hasToken: true,
    });

    render(<Settings />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /link with plex/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /link with plex/i }));

    await waitFor(() => {
      expect(screen.getByText('ABC')).toBeInTheDocument();
    });

    await waitFor(
      () => {
        expect(screen.getByText(/authorized/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /complete setup/i })).toBeInTheDocument();
      },
      { timeout: 3500 }
    );

    await user.click(screen.getByRole('button', { name: /complete setup/i }));

    await waitFor(() => {
      expect(api.savePlexSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'http://192.168.1.50:32400',
          token: 'auth-token',
        })
      );
    });
  });

  it('shows manual entry when Or enter manually is clicked', async () => {
    const user = userEvent.setup();

    render(<Settings />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /or enter manually/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /or enter manually/i }));

    expect(screen.getByPlaceholderText(/192\.168\.1\.50:32400/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/enter your plex token/i)).toBeInTheDocument();
  });

  it('shows error when createPlexPin fails', async () => {
    const user = userEvent.setup();
    vi.mocked(api.createPlexPin).mockRejectedValue({
      response: { data: { error: 'Plex service unavailable' } },
    });

    render(<Settings />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /link with plex/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /link with plex/i }));

    await waitFor(() => {
      expect(screen.getByText(/plex service unavailable/i)).toBeInTheDocument();
    });
  });
});
