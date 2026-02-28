import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { createPlexPin, pollPlexPin, getPlexServers } from '../src/services/plexAuth';

vi.mock('axios');
vi.mock('../src/db', () => ({
  getInstanceId: vi.fn(() => 'test-client-id'),
}));

describe('plexAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createPlexPin', () => {
    it('creates PIN and returns authUrl, code, pinId', async () => {
      vi.mocked(axios.post).mockResolvedValue({
        data: { id: 12345, code: 'ABCD' },
      });

      const result = await createPlexPin();

      expect(axios.post).toHaveBeenCalledWith(
        'https://plex.tv/api/v2/pins',
        expect.any(String),
        expect.objectContaining({
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        })
      );
      expect(result).toEqual({
        authUrl: expect.stringContaining('clientID=test-client-id'),
        code: 'ABCD',
        pinId: 12345,
      });
      expect(result.authUrl).toContain('code=ABCD');
    });

    it('throws when Plex API fails', async () => {
      vi.mocked(axios.post).mockRejectedValue(new Error('Network error'));

      await expect(createPlexPin()).rejects.toThrow('Network error');
    });
  });

  describe('pollPlexPin', () => {
    it('returns token when authorized', async () => {
      vi.mocked(axios.get).mockResolvedValue({
        data: { authToken: 'plex-token-xyz', expiresAt: '2025-01-01T00:00:00Z' },
      });

      const result = await pollPlexPin(12345, 'ABCD');

      expect(axios.get).toHaveBeenCalledWith(
        'https://plex.tv/api/v2/pins/12345',
        expect.objectContaining({
          params: { code: 'ABCD', 'X-Plex-Client-Identifier': 'test-client-id' },
        })
      );
      expect(result).toEqual({
        token: 'plex-token-xyz',
        expiresAt: '2025-01-01T00:00:00Z',
      });
    });

    it('returns null token when not yet authorized', async () => {
      vi.mocked(axios.get).mockResolvedValue({
        data: { authToken: null },
      });

      const result = await pollPlexPin(12345, 'ABCD');

      expect(result.token).toBeNull();
    });

    it('returns undefined expiresAt when not in response', async () => {
      vi.mocked(axios.get).mockResolvedValue({
        data: { authToken: 'tok', expiresAt: undefined },
      });

      const result = await pollPlexPin(12345, 'ABCD');

      expect(result.token).toBe('tok');
      expect(result.expiresAt).toBeUndefined();
    });

    it('throws when Plex API fails', async () => {
      vi.mocked(axios.get).mockRejectedValue(new Error('Timeout'));

      await expect(pollPlexPin(12345, 'ABCD')).rejects.toThrow('Timeout');
    });
  });

  describe('getPlexServers', () => {
    it('returns server list from resources API', async () => {
      vi.mocked(axios.get).mockResolvedValue({
        data: {
          MediaContainer: {
            Device: [
              {
                name: 'My Plex',
                provides: 'server',
                Connection: [{ uri: 'http://192.168.1.50:32400' }],
              },
              {
                name: 'Plexamp',
                provides: 'client,player',
              },
            ],
          },
        },
      });

      const result = await getPlexServers('token');

      expect(axios.get).toHaveBeenCalledWith(
        'https://plex.tv/resources',
        expect.objectContaining({
          headers: { Accept: 'application/json', 'X-Plex-Token': 'token' },
        })
      );
      expect(result).toEqual([{ name: 'My Plex', uri: 'http://192.168.1.50:32400' }]);
    });

    it('returns empty array when no servers', async () => {
      vi.mocked(axios.get).mockResolvedValue({
        data: { MediaContainer: { Device: [] } },
      });

      const result = await getPlexServers('token');

      expect(result).toEqual([]);
    });

    it('uses default name when device has no name', async () => {
      vi.mocked(axios.get).mockResolvedValue({
        data: {
          MediaContainer: {
            Device: [
              {
                provides: 'server',
                Connection: [{ uri: 'http://192.168.1.1:32400' }],
              },
            ],
          },
        },
      });

      const result = await getPlexServers('token');

      expect(result).toEqual([{ name: 'Plex Server', uri: 'http://192.168.1.1:32400' }]);
    });

    it('handles URI in uppercase (Connection.URI)', async () => {
      vi.mocked(axios.get).mockResolvedValue({
        data: {
          MediaContainer: {
            Device: [
              {
                name: 'Server',
                provides: 'server',
                Connection: [{ URI: 'http://plex.local:32400' }],
              },
            ],
          },
        },
      });

      const result = await getPlexServers('token');

      expect(result).toEqual([{ name: 'Server', uri: 'http://plex.local:32400' }]);
    });

    it('takes first connection when server has multiple', async () => {
      vi.mocked(axios.get).mockResolvedValue({
        data: {
          MediaContainer: {
            Device: [
              {
                name: 'Multi',
                provides: 'server',
                Connection: [
                  { uri: 'http://192.168.1.1:32400' },
                  { uri: 'http://10.0.0.1:32400' },
                ],
              },
            ],
          },
        },
      });

      const result = await getPlexServers('token');

      expect(result).toEqual([{ name: 'Multi', uri: 'http://192.168.1.1:32400' }]);
    });

    it('handles missing MediaContainer', async () => {
      vi.mocked(axios.get).mockResolvedValue({ data: {} });

      const result = await getPlexServers('token');

      expect(result).toEqual([]);
    });

    it('throws when Plex API fails', async () => {
      vi.mocked(axios.get).mockRejectedValue(new Error('401 Unauthorized'));

      await expect(getPlexServers('bad-token')).rejects.toThrow('401 Unauthorized');
    });
  });
});
