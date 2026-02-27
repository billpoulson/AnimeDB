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
const mockRetryUpnp = vi.fn();

vi.mock('../src/services/upnp', () => ({
  getUpnpState: (...args: any[]) => mockGetUpnpState(...args),
  getExternalUrl: (...args: any[]) => mockGetExternalUrl(...args),
  setManualExternalUrl: (...args: any[]) => mockSetManualExternalUrl(...args),
  retryUpnp: (...args: any[]) => mockRetryUpnp(...args),
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
    authDisabled: true,
    buildSha: 'test',
    githubRepo: 'test/test',
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

  describe('POST /api/networking/upnp-retry', () => {
    it('retries UPnP with default port', async () => {
      mockRetryUpnp.mockResolvedValue({ active: true, externalIp: '1.2.3.4', externalUrl: 'http://1.2.3.4:3000', externalPort: 3000, error: null });
      mockGetExternalUrl.mockReturnValue('http://1.2.3.4:3000');

      const res = await request.post('/api/networking/upnp-retry').send({});

      expect(res.status).toBe(200);
      expect(mockRetryUpnp).toHaveBeenCalledWith(3000);
      expect(res.body.upnp.active).toBe(true);
      expect(res.body.externalUrl).toBe('http://1.2.3.4:3000');
    });

    it('retries UPnP with alternate port', async () => {
      mockRetryUpnp.mockResolvedValue({ active: true, externalIp: '1.2.3.4', externalUrl: 'http://1.2.3.4:4000', externalPort: 4000, error: null });
      mockGetExternalUrl.mockReturnValue('http://1.2.3.4:4000');

      const res = await request.post('/api/networking/upnp-retry').send({ port: 4000 });

      expect(res.status).toBe(200);
      expect(mockRetryUpnp).toHaveBeenCalledWith(4000);
      expect(res.body.upnp.externalPort).toBe(4000);
    });

    it('returns error state when retry fails', async () => {
      mockRetryUpnp.mockResolvedValue({ active: false, externalIp: null, externalUrl: null, externalPort: null, error: 'Port in use' });
      mockGetExternalUrl.mockReturnValue(null);

      const res = await request.post('/api/networking/upnp-retry').send({ port: 80 });

      expect(res.status).toBe(200);
      expect(res.body.upnp.active).toBe(false);
      expect(res.body.upnp.error).toBe('Port in use');
    });

    it('rejects invalid port values', async () => {
      const res = await request.post('/api/networking/upnp-retry').send({ port: 'abc' });
      expect(res.status).toBe(400);

      const res2 = await request.post('/api/networking/upnp-retry').send({ port: 0 });
      expect(res2.status).toBe(400);

      const res3 = await request.post('/api/networking/upnp-retry').send({ port: 70000 });
      expect(res3.status).toBe(400);

      const res4 = await request.post('/api/networking/upnp-retry').send({ port: 3.5 });
      expect(res4.status).toBe(400);
    });
  });
});
