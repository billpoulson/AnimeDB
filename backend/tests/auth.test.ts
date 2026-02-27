import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import supertest from 'supertest';
import { createApp } from '../src/app';
import { initDb, closeDb, getDb } from '../src/db';

vi.mock('../src/services/queue', () => ({ enqueue: vi.fn() }));
vi.mock('../src/services/plexClient', () => ({
  testPlexConnection: vi.fn().mockResolvedValue(false),
}));
vi.mock('../src/services/upnp', () => ({
  getUpnpState: vi.fn().mockReturnValue({ active: false, externalIp: null, externalUrl: null, error: null }),
  getExternalUrl: vi.fn().mockReturnValue(null),
  setManualExternalUrl: vi.fn(),
}));

let authDisabled = false;
vi.mock('../src/config', () => ({
  get config() {
    return {
      outputFormat: 'mkv',
      downloadPath: '/downloads',
      mediaPath: '/media',
      dbPath: ':memory:',
      port: 3000,
      instanceName: 'TestInstance',
      externalUrl: '',
      authDisabled,
      buildSha: 'test',
      githubRepo: 'test/test',
      plex: { url: '', token: '', sectionMovies: 1, sectionTv: 2 },
    };
  },
}));

describe('Auth API', () => {
  let request: ReturnType<typeof supertest>;

  beforeEach(() => {
    authDisabled = false;
    initDb(':memory:');
    request = supertest(createApp());
  });

  afterEach(() => {
    closeDb();
  });

  describe('GET /api/auth/status', () => {
    it('returns setup=false and authRequired=true on fresh db', async () => {
      const res = await request.get('/api/auth/status');
      expect(res.status).toBe(200);
      expect(res.body.setup).toBe(false);
      expect(res.body.authenticated).toBe(false);
      expect(res.body.authRequired).toBe(true);
    });

    it('returns authRequired=false when auth is disabled', async () => {
      authDisabled = true;
      request = supertest(createApp());

      const res = await request.get('/api/auth/status');
      expect(res.status).toBe(200);
      expect(res.body.authRequired).toBe(false);
      expect(res.body.authenticated).toBe(true);
    });

    it('returns setup=true after password is configured', async () => {
      await request.post('/api/auth/setup').send({ password: 'testpass' });

      const res = await request.get('/api/auth/status');
      expect(res.body.setup).toBe(true);
    });

    it('returns authenticated=true with valid token', async () => {
      const setup = await request.post('/api/auth/setup').send({ password: 'testpass' });
      const token = setup.body.token;

      const res = await request
        .get('/api/auth/status')
        .set('Authorization', `Bearer ${token}`);
      expect(res.body.authenticated).toBe(true);
    });

    it('returns authenticated=false with invalid token', async () => {
      await request.post('/api/auth/setup').send({ password: 'testpass' });

      const res = await request
        .get('/api/auth/status')
        .set('Authorization', 'Bearer bad-token');
      expect(res.body.authenticated).toBe(false);
    });
  });

  describe('POST /api/auth/setup', () => {
    it('creates a password and returns a token', async () => {
      const res = await request.post('/api/auth/setup').send({ password: 'mypassword' });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeTruthy();
      expect(typeof res.body.token).toBe('string');
    });

    it('rejects setup if password already exists', async () => {
      await request.post('/api/auth/setup').send({ password: 'first' });
      const res = await request.post('/api/auth/setup').send({ password: 'second' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('already configured');
    });

    it('rejects password shorter than 4 characters', async () => {
      const res = await request.post('/api/auth/setup').send({ password: 'abc' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('at least 4');
    });

    it('rejects missing password', async () => {
      const res = await request.post('/api/auth/setup').send({});

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/auth/login', () => {
    it('returns a token with correct password', async () => {
      await request.post('/api/auth/setup').send({ password: 'secret123' });

      const res = await request.post('/api/auth/login').send({ password: 'secret123' });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeTruthy();
    });

    it('rejects wrong password', async () => {
      await request.post('/api/auth/setup').send({ password: 'secret123' });

      const res = await request.post('/api/auth/login').send({ password: 'wrong' });

      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Invalid password');
    });

    it('rejects login when no password configured', async () => {
      const res = await request.post('/api/auth/login').send({ password: 'anything' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('No password configured');
    });

    it('invalidates previous session on new login', async () => {
      await request.post('/api/auth/setup').send({ password: 'secret' });
      const login1 = await request.post('/api/auth/login').send({ password: 'secret' });
      const token1 = login1.body.token;

      const login2 = await request.post('/api/auth/login').send({ password: 'secret' });
      const token2 = login2.body.token;

      expect(token1).not.toBe(token2);

      const check = await request
        .get('/api/auth/status')
        .set('Authorization', `Bearer ${token1}`);
      expect(check.body.authenticated).toBe(false);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('clears the session', async () => {
      const setup = await request.post('/api/auth/setup').send({ password: 'secret' });
      const token = setup.body.token;

      await request.post('/api/auth/logout');

      const check = await request
        .get('/api/auth/status')
        .set('Authorization', `Bearer ${token}`);
      expect(check.body.authenticated).toBe(false);
    });
  });

  describe('POST /api/auth/change-password', () => {
    it('changes the password and returns a new token', async () => {
      const setup = await request.post('/api/auth/setup').send({ password: 'oldpass' });
      const oldToken = setup.body.token;

      const res = await request.post('/api/auth/change-password').send({
        currentPassword: 'oldpass',
        newPassword: 'newpass1',
      });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeTruthy();
      expect(res.body.token).not.toBe(oldToken);

      const login = await request.post('/api/auth/login').send({ password: 'newpass1' });
      expect(login.status).toBe(200);
    });

    it('rejects wrong current password', async () => {
      await request.post('/api/auth/setup').send({ password: 'oldpass' });

      const res = await request.post('/api/auth/change-password').send({
        currentPassword: 'wrong',
        newPassword: 'newpass1',
      });

      expect(res.status).toBe(401);
    });

    it('rejects short new password', async () => {
      await request.post('/api/auth/setup').send({ password: 'oldpass' });

      const res = await request.post('/api/auth/change-password').send({
        currentPassword: 'oldpass',
        newPassword: 'ab',
      });

      expect(res.status).toBe(400);
    });
  });
});

describe('Auth middleware', () => {
  let request: ReturnType<typeof supertest>;

  beforeEach(() => {
    authDisabled = false;
    initDb(':memory:');
    request = supertest(createApp());
  });

  afterEach(() => {
    closeDb();
  });

  it('allows unauthenticated access when no password is set', async () => {
    const res = await request.get('/api/downloads');
    expect(res.status).toBe(200);
  });

  it('blocks unauthenticated access after password is set', async () => {
    await request.post('/api/auth/setup').send({ password: 'secret' });

    const res = await request.get('/api/downloads');
    expect(res.status).toBe(401);
  });

  it('allows access with valid token after password is set', async () => {
    const setup = await request.post('/api/auth/setup').send({ password: 'secret' });

    const res = await request
      .get('/api/downloads')
      .set('Authorization', `Bearer ${setup.body.token}`);
    expect(res.status).toBe(200);
  });

  it('blocks access with invalid token', async () => {
    await request.post('/api/auth/setup').send({ password: 'secret' });

    const res = await request
      .get('/api/downloads')
      .set('Authorization', 'Bearer invalid-token');
    expect(res.status).toBe(401);
  });

  it('allows all access when auth is disabled', async () => {
    authDisabled = true;
    request = supertest(createApp());

    await request.post('/api/auth/setup').send({ password: 'secret' });

    const res = await request.get('/api/downloads');
    expect(res.status).toBe(200);
  });

  it('never blocks /api/auth routes', async () => {
    await request.post('/api/auth/setup').send({ password: 'secret' });

    const res = await request.get('/api/auth/status');
    expect(res.status).toBe(200);
  });

  it('never blocks /api/federation routes (uses own auth)', async () => {
    await request.post('/api/auth/setup').send({ password: 'secret' });

    const res = await request.get('/api/federation/library');
    expect(res.status).toBe(401);
    expect(res.body.error).toContain('Authorization');
  });
});
