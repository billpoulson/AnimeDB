import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import Settings from '../src/pages/Settings';
import * as api from '../src/api/client';

vi.mock('../src/api/client');

function setupMocks(overrides?: { authRequired?: boolean }) {
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
    remoteDate: '',
    updateAvailable: false,
    updateInProgress: false,
  });
  vi.mocked(api.getAuthStatus).mockResolvedValue({
    setup: true,
    authenticated: true,
    authRequired: overrides?.authRequired ?? false,
  });
}

describe('Settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupMocks();
  });

  describe('sidebar layout', () => {
    it('renders sidebar nav with Libraries, Plex, and Updates links', async () => {
      render(<Settings />);

      await waitFor(() => {
        expect(screen.getByRole('link', { name: /^libraries$/i })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /^plex$/i })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /^updates$/i })).toBeInTheDocument();
      });
    });

    it('nav links have correct href for anchor navigation', async () => {
      render(<Settings />);

      await waitFor(() => {
        expect(screen.getByRole('link', { name: /^libraries$/i })).toHaveAttribute('href', '#libraries');
        expect(screen.getByRole('link', { name: /^plex$/i })).toHaveAttribute('href', '#plex');
        expect(screen.getByRole('link', { name: /^updates$/i })).toHaveAttribute('href', '#updates');
      });
    });

    it('hides Security link when auth is not required', async () => {
      setupMocks({ authRequired: false });
      render(<Settings />);

      await waitFor(() => {
        expect(screen.getByRole('link', { name: /^libraries$/i })).toBeInTheDocument();
      });

      expect(screen.queryByRole('link', { name: /^security$/i })).not.toBeInTheDocument();
    });

    it('shows Security link when auth is required', async () => {
      setupMocks({ authRequired: true });
      render(<Settings />);

      await waitFor(() => {
        expect(screen.getByRole('link', { name: /^security$/i })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /^security$/i })).toHaveAttribute('href', '#security');
      });
    });

    it('renders section containers with correct ids', async () => {
      const { container } = render(<Settings />);

      await waitFor(() => {
        expect(screen.getByRole('link', { name: /^libraries$/i })).toBeInTheDocument();
      });

      expect(container.querySelector('#libraries')).toBeInTheDocument();
      expect(container.querySelector('#plex')).toBeInTheDocument();
      expect(container.querySelector('#updates')).toBeInTheDocument();
      expect(container.querySelector('#security')).toBeInTheDocument();
    });
  });

  describe('section content', () => {
    it('renders Libraries section with Add library button', async () => {
      render(<Settings />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add library/i })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /libraries/i })).toBeInTheDocument();
      });
    });

    it('renders Plex Integration section', async () => {
      render(<Settings />);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /plex integration/i })).toBeInTheDocument();
      });
    });

    it('renders Updates section', async () => {
      render(<Settings />);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /updates/i })).toBeInTheDocument();
      });
    });
  });
});
