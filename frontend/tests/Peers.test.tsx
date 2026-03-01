import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Peers from '../src/pages/Peers';
import * as api from '../src/api/client';

vi.mock('../src/api/client');

const defaultNetworking = {
  instanceId: 'test-instance',
  instanceName: 'TestNode',
  externalUrl: null,
  upnp: {
    active: false,
    externalIp: null,
    externalPort: null,
    error: 'Timeout',
  },
};

function setupMocks(networking = defaultNetworking, peers: api.Peer[] = [], libraries: api.Library[] = []) {
  vi.mocked(api.getNetworking).mockResolvedValue(networking);
  vi.mocked(api.getApiKeys).mockResolvedValue([]);
  vi.mocked(api.getPeers).mockResolvedValue(peers);
  vi.mocked(api.getLibraries).mockResolvedValue(libraries);
}

describe('Peers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupMocks();
  });

  describe('UPnP retry', () => {
    it('shows Retry UPnP button when UPnP has error', async () => {
      render(
        <MemoryRouter>
          <Peers />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /retry upnp/i })).toBeInTheDocument();
      });
    });

    it('shows validation error when invalid port is entered', async () => {
      const user = userEvent.setup();
      render(
        <MemoryRouter>
          <Peers />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Port')).toBeInTheDocument();
      });

      await user.type(screen.getByPlaceholderText('Port'), '99999');
      await user.click(screen.getByRole('button', { name: /try port/i }));

      await waitFor(() => {
        expect(screen.getByText(/enter a valid port/i)).toBeInTheDocument();
      });
    });

    it('updates UI when retry succeeds', async () => {
      const user = userEvent.setup();
      vi.mocked(api.retryUpnp).mockResolvedValue({
        externalUrl: 'http://1.2.3.4:3000',
        upnp: {
          active: true,
          externalIp: '1.2.3.4',
          externalPort: 3000,
          error: null,
        },
      });

      render(
        <MemoryRouter>
          <Peers />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /retry upnp/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /retry upnp/i }));

      await waitFor(() => {
        expect(api.retryUpnp).toHaveBeenCalled();
      });

      await waitFor(() => {
        expect(screen.getByText(/active \(1\.2\.3\.4:3000\)/i)).toBeInTheDocument();
      });
    });

    it('shows error message when retry fails', async () => {
      const user = userEvent.setup();
      vi.mocked(api.retryUpnp).mockRejectedValue(new Error('Port in use'));

      render(
        <MemoryRouter>
          <Peers />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /retry upnp/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /retry upnp/i }));

      await waitFor(() => {
        expect(screen.getByText(/port in use|retry failed/i)).toBeInTheDocument();
      });
    });

    it('calls retryUpnp with port when Try port is clicked with port entered', async () => {
      const user = userEvent.setup();
      vi.mocked(api.retryUpnp).mockResolvedValue({
        externalUrl: null,
        upnp: {
          active: false,
          externalIp: null,
          externalPort: null,
          error: 'Still failed',
        },
      });

      render(
        <MemoryRouter>
          <Peers />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Port')).toBeInTheDocument();
      });

      await user.type(screen.getByPlaceholderText('Port'), '4000');
      await user.click(screen.getByRole('button', { name: /try port/i }));

      await waitFor(() => {
        expect(api.retryUpnp).toHaveBeenCalledWith(4000);
      });
    });
  });

  describe('Auto-sync', () => {
    it('shows Auto-sync button when peer has auto_replicate false', async () => {
      setupMocks(defaultNetworking, [
        { id: 'p1', name: 'NodeA', url: 'http://nodea:3000', instance_id: 'i1', last_seen: null, created_at: '2025-01-01' },
      ]);

      render(
        <MemoryRouter>
          <Peers />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('NodeA')).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: /auto-sync/i })).toBeInTheDocument();
    });

    it('shows Auto-sync on badge when peer has auto_replicate true', async () => {
      setupMocks(defaultNetworking, [
        { id: 'p1', name: 'NodeA', url: 'http://nodea:3000', instance_id: 'i1', last_seen: null, auto_replicate: true, created_at: '2025-01-01' },
      ]);

      render(
        <MemoryRouter>
          <Peers />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('NodeA')).toBeInTheDocument();
      });

      expect(screen.getByText(/auto-sync on/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^off$/i })).toBeInTheDocument();
    });

    it('calls updatePeer with auto_replicate false when Off clicked', async () => {
      const user = userEvent.setup();
      vi.mocked(api.updatePeer).mockResolvedValue({
        id: 'p1', name: 'NodeA', url: 'http://nodea:3000', instance_id: 'i1', last_seen: null, auto_replicate: false, created_at: '2025-01-01',
      });
      setupMocks(defaultNetworking, [
        { id: 'p1', name: 'NodeA', url: 'http://nodea:3000', instance_id: 'i1', last_seen: null, auto_replicate: true, created_at: '2025-01-01' },
      ]);

      render(
        <MemoryRouter>
          <Peers />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /^off$/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /^off$/i }));

      await waitFor(() => {
        expect(api.updatePeer).toHaveBeenCalledWith('p1', { auto_replicate: false, sync_library_id: null });
      });
    });

    it('calls updatePeer with auto_replicate true when Enable clicked from picker', async () => {
      const user = userEvent.setup();
      vi.mocked(api.updatePeer).mockResolvedValue({
        id: 'p1', name: 'NodeA', url: 'http://nodea:3000', instance_id: 'i1', last_seen: null, auto_replicate: true, created_at: '2025-01-01',
      });
      setupMocks(defaultNetworking, [
        { id: 'p1', name: 'NodeA', url: 'http://nodea:3000', instance_id: 'i1', last_seen: null, created_at: '2025-01-01' },
      ], [{ id: 'lib1', name: 'Movies', path: '/media/movies', type: 'movies', plex_section_id: null, created_at: '2025-01-01' }]);

      render(
        <MemoryRouter>
          <Peers />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /auto-sync/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /auto-sync/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /enable/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /enable/i }));

      await waitFor(() => {
        expect(api.updatePeer).toHaveBeenCalledWith('p1', expect.objectContaining({ auto_replicate: true }));
      });
    });
  });
});
