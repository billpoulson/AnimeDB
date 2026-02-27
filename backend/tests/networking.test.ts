import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import supertest from 'supertest';
import { createApp } from '../src/app';
import { initDb, closeDb } from '../src/db';

vi.mock('../src/services/queue', () => ({ enqueue: vi.fn() }));
vi.mock('../src/services/plexClient', () => ({
  testPlexConnection: vi.fn().mockResolvedValue(false),
}));

const mockGetUpnpState = vi.fn();
const mockGetExternalUrl = vi.fn();
const mockSetManualExternalUrl = vi.fn();

vi.mock('../src/services/upnp', () => ({
  getUpnpState: (...args: any[]) => mockGetUpnpState(...args),
  getExternalUrl: (...args: any[]) => mockGetExternalUrl(...args),
  setManualExternalUrl: (...args: any[]) => mockSetManualExternalUrl(...args),
}));

vi.mock('../src/config', () => ({
  config: {
    outputFormat: 'mkv',
    downloadPath: '/downloads',
    mediaPath: '/media',
    dbPath: ':memory:',
    port: 3000,
    instanceName: 'TestInstance',
    externalUrl: '',
    plex: { url: '', token: '', sectionMovies: 1, sectionTv: 2 },
  },
}));

describe('Networking API', () => {
  let request: ReturnType<typeof supertest>;

  beforeEach(() => {
    initDb(':memory:');
    request = supertest(createApp());
    vi.clearAllMocks();
  });

  afterEach(() => {
    closeDb();
  });

  describe('GET /api/networking', () => {
    it('returns networking info with UPnP inactive', async () => {
      mockGetUpnpState.mockReturnValue({ active: false, externalIp: null, externalUrl: null, error: 'timeout' });
      mockGetExternalUrl.mockReturnValue(null);

      const res = await request.get('/api/networking');

      expect(res.status).toBe(200);
      expect(res.body.instanceName).toBe('TestInstance');
      expect(res.body.externalUrl).toBeNull();
      expect(res.body.upnp.active).toBe(false);
      expect(res.body.upnp.error).toBe('timeout');
    });

    it('returns networking info with UPnP active', async () => {
      mockGetUpnpState.mockReturnValue({ active: true, externalIp: '1.2.3.4', externalUrl: 'http://1.2.3.4:3000', error: null });
      mockGetExternalUrl.mockReturnValue('http://1.2.3.4:3000');

      const res = await request.get('/api/networking');

      expect(res.status).toBe(200);
      expect(res.body.externalUrl).toBe('http://1.2.3.4:3000');
      expect(res.body.upnp.active).toBe(true);
      expect(res.body.upnp.externalIp).toBe('1.2.3.4');
    });

    it('returns manual external URL', async () => {
      mockGetUpnpState.mockReturnValue({ active: false, externalIp: null, externalUrl: null, error: null });
      mockGetExternalUrl.mockReturnValue('https://my.domain.com');

      const res = await request.get('/api/networking');

      expect(res.body.externalUrl).toBe('https://my.domain.com');
      expect(res.body.upnp.active).toBe(false);
    });
  });

  describe('PUT /api/networking/external-url', () => {
    it('sets a manual external URL', async () => {
      mockGetExternalUrl.mockReturnValue('http://5.6.7.8:3000');

      const res = await request
        .put('/api/networking/external-url')
        .send({ url: 'http://5.6.7.8:3000' });

      expect(res.status).toBe(200);
      expect(mockSetManualExternalUrl).toHaveBeenCalledWith('http://5.6.7.8:3000');
      expect(res.body.externalUrl).toBe('http://5.6.7.8:3000');
    });

    it('strips trailing slashes', async () => {
      mockGetExternalUrl.mockReturnValue('http://example.com');

      const res = await request
        .put('/api/networking/external-url')
        .send({ url: 'http://example.com///' });

      expect(res.status).toBe(200);
      expect(mockSetManualExternalUrl).toHaveBeenCalledWith('http://example.com');
    });

    it('clears external URL with null', async () => {
      mockGetExternalUrl.mockReturnValue(null);

      const res = await request
        .put('/api/networking/external-url')
        .send({ url: null });

      expect(res.status).toBe(200);
      expect(mockSetManualExternalUrl).toHaveBeenCalledWith(null);
    });

    it('clears external URL with empty string', async () => {
      mockGetExternalUrl.mockReturnValue(null);

      const res = await request
        .put('/api/networking/external-url')
        .send({ url: '' });

      expect(res.status).toBe(200);
      expect(mockSetManualExternalUrl).toHaveBeenCalledWith(null);
    });

    it('rejects non-string url', async () => {
      const res = await request
        .put('/api/networking/external-url')
        .send({ url: 12345 });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('string or null');
    });
  });
});
