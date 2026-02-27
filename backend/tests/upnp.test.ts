import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const mockPortMapping = vi.fn();
const mockPortUnmapping = vi.fn((_opts: any, cb: Function) => cb(null));
const mockExternalIp = vi.fn();
const mockClose = vi.fn();

vi.mock('nat-upnp-2', () => ({
  default: {
    createClient: () => ({
      portMapping: mockPortMapping,
      portUnmapping: mockPortUnmapping,
      externalIp: mockExternalIp,
      close: mockClose,
    }),
  },
}));

vi.mock('../src/config', () => ({
  config: {
    port: 3000,
    externalUrl: '',
    authDisabled: true,
  },
}));

import {
  startUpnp,
  stopUpnp,
  getUpnpState,
  getExternalUrl,
  setManualExternalUrl,
} from '../src/services/upnp';

describe('UPnP Service - state management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await stopUpnp();
    setManualExternalUrl(null);
  });

  it('exports expected functions', () => {
    expect(typeof startUpnp).toBe('function');
    expect(typeof stopUpnp).toBe('function');
    expect(typeof getUpnpState).toBe('function');
    expect(typeof getExternalUrl).toBe('function');
    expect(typeof setManualExternalUrl).toBe('function');
  });

  it('getUpnpState returns inactive state when no mapping has been done', () => {
    const state = getUpnpState();
    expect(state.active).toBe(false);
    expect(state.error).toBeNull();
  });

  it('getExternalUrl returns null when no URL is set', () => {
    expect(getExternalUrl()).toBeNull();
  });

  it('setManualExternalUrl sets the external URL', () => {
    setManualExternalUrl('http://manual.example.com');
    expect(getExternalUrl()).toBe('http://manual.example.com');
  });

  it('setManualExternalUrl clears URL with null', () => {
    setManualExternalUrl('http://temp.com');
    expect(getExternalUrl()).toBe('http://temp.com');

    setManualExternalUrl(null);
    expect(getExternalUrl()).toBeNull();
  });

  it('setManualExternalUrl clears URL with empty string', () => {
    setManualExternalUrl('http://temp.com');
    setManualExternalUrl('');
    expect(getExternalUrl()).toBeNull();
  });

  it('getUpnpState returns a copy, not a reference', () => {
    const state1 = getUpnpState();
    const state2 = getUpnpState();
    expect(state1).not.toBe(state2);
    expect(state1).toEqual(state2);
  });

  it('startUpnp skips UPnP when manual URL is set', async () => {
    setManualExternalUrl('http://manual.test:3000');

    await startUpnp();

    expect(getExternalUrl()).toBe('http://manual.test:3000');
    const state = getUpnpState();
    expect(state.active).toBe(false);
    expect(state.error).toBeNull();
    expect(mockPortMapping).not.toHaveBeenCalled();
  });

  it('stopUpnp is a no-op when not active', async () => {
    await stopUpnp();
    expect(getUpnpState().active).toBe(false);
    expect(mockPortUnmapping).not.toHaveBeenCalled();
  });
});

describe('UPnP Service - startUpnp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await stopUpnp();
    setManualExternalUrl(null);
  });

  it('creates port mapping and sets active state on success', async () => {
    mockPortMapping.mockImplementation((_opts: any, cb: Function) => cb(null));
    mockExternalIp.mockImplementation((cb: Function) => cb(null, '203.0.113.42'));

    await startUpnp();

    const state = getUpnpState();
    expect(state.active).toBe(true);
    expect(state.externalIp).toBe('203.0.113.42');
    expect(state.externalUrl).toBe('http://203.0.113.42:3000');
    expect(state.error).toBeNull();
    expect(getExternalUrl()).toBe('http://203.0.113.42:3000');
  });

  it('calls portMapping with correct options', async () => {
    mockPortMapping.mockImplementation((_opts: any, cb: Function) => cb(null));
    mockExternalIp.mockImplementation((cb: Function) => cb(null, '10.0.0.1'));

    await startUpnp();

    expect(mockPortMapping).toHaveBeenCalledTimes(1);
    const opts = mockPortMapping.mock.calls[0][0];
    expect(opts.public).toBe(3000);
    expect(opts.private).toBe(3000);
    expect(opts.description).toBe('AnimeDB');
    expect(opts.ttl).toBe(0);
  });

  it('removes existing mapping before creating a new one', async () => {
    mockPortMapping.mockImplementation((_opts: any, cb: Function) => cb(null));
    mockExternalIp.mockImplementation((cb: Function) => cb(null, '10.0.0.1'));

    await startUpnp();

    expect(mockPortUnmapping).toHaveBeenCalledTimes(1);
    const unmapOpts = mockPortUnmapping.mock.calls[0][0];
    expect(unmapOpts.public).toBe(3000);

    const mapCallOrder = mockPortUnmapping.mock.invocationCallOrder[0];
    const portMapOrder = mockPortMapping.mock.invocationCallOrder[0];
    expect(mapCallOrder).toBeLessThan(portMapOrder);
  });

  it('still creates mapping when pre-cleanup unmapping fails', async () => {
    mockPortUnmapping.mockImplementationOnce((_opts: any, cb: Function) => cb(new Error('no existing mapping')));
    mockPortMapping.mockImplementation((_opts: any, cb: Function) => cb(null));
    mockExternalIp.mockImplementation((cb: Function) => cb(null, '10.0.0.1'));

    await startUpnp();

    expect(getUpnpState().active).toBe(true);
    expect(mockPortMapping).toHaveBeenCalledTimes(1);
  });

  it('sets error state when port mapping fails', async () => {
    mockPortMapping.mockImplementation((_opts: any, cb: Function) => cb(new Error('Router not found')));

    await startUpnp();

    const state = getUpnpState();
    expect(state.active).toBe(false);
    expect(state.externalIp).toBeNull();
    expect(state.externalUrl).toBeNull();
    expect(state.error).toBe('Router not found');
  });

  it('sets error state when externalIp fails after successful mapping', async () => {
    mockPortMapping.mockImplementation((_opts: any, cb: Function) => cb(null));
    mockExternalIp.mockImplementation((cb: Function) => cb(new Error('IP lookup timeout')));

    await startUpnp();

    const state = getUpnpState();
    expect(state.active).toBe(false);
    expect(state.error).toBe('IP lookup timeout');
  });

  it('sets fallback error message when error has no message', async () => {
    mockPortMapping.mockImplementation((_opts: any, cb: Function) => cb(new Error()));

    await startUpnp();

    const state = getUpnpState();
    expect(state.error).toBe('UPnP discovery failed');
  });
});

describe('UPnP Service - stopUpnp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await stopUpnp();
    setManualExternalUrl(null);
  });

  it('removes port mapping and closes client when active', async () => {
    mockPortMapping.mockImplementation((_opts: any, cb: Function) => cb(null));
    mockExternalIp.mockImplementation((cb: Function) => cb(null, '1.2.3.4'));
    mockPortUnmapping.mockImplementation((_opts: any, cb: Function) => cb(null));

    await startUpnp();
    expect(getUpnpState().active).toBe(true);

    mockPortUnmapping.mockClear();
    await stopUpnp();

    expect(mockPortUnmapping).toHaveBeenCalledTimes(1);
    const opts = mockPortUnmapping.mock.calls[0][0];
    expect(opts.public).toBe(3000);
    expect(mockClose).toHaveBeenCalledTimes(1);
    expect(getUpnpState().active).toBe(false);
  });

  it('still closes client when port unmapping fails', async () => {
    mockPortMapping.mockImplementation((_opts: any, cb: Function) => cb(null));
    mockExternalIp.mockImplementation((cb: Function) => cb(null, '1.2.3.4'));
    mockPortUnmapping.mockImplementation((_opts: any, cb: Function) => cb(new Error('unmap failed')));

    await startUpnp();
    await stopUpnp();

    expect(mockClose).toHaveBeenCalledTimes(1);
    expect(getUpnpState().active).toBe(false);
  });

  it('does not call unmapping a second time after already stopped', async () => {
    mockPortMapping.mockImplementation((_opts: any, cb: Function) => cb(null));
    mockExternalIp.mockImplementation((cb: Function) => cb(null, '1.2.3.4'));
    mockPortUnmapping.mockImplementation((_opts: any, cb: Function) => cb(null));

    await startUpnp();
    await stopUpnp();

    mockPortUnmapping.mockClear();
    mockClose.mockClear();

    await stopUpnp();
    expect(mockPortUnmapping).not.toHaveBeenCalled();
    expect(mockClose).not.toHaveBeenCalled();
  });
});

describe('UPnP Service - manual URL and state interaction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await stopUpnp();
    setManualExternalUrl(null);
  });

  it('manual URL takes precedence over UPnP-discovered URL', async () => {
    mockPortMapping.mockImplementation((_opts: any, cb: Function) => cb(null));
    mockExternalIp.mockImplementation((cb: Function) => cb(null, '1.2.3.4'));

    await startUpnp();
    expect(getExternalUrl()).toBe('http://1.2.3.4:3000');

    setManualExternalUrl('https://custom.domain.com');
    expect(getExternalUrl()).toBe('https://custom.domain.com');
  });

  it('clearing manual URL falls back to null when UPnP is not active', () => {
    setManualExternalUrl('http://temp.com');
    setManualExternalUrl(null);

    expect(getExternalUrl()).toBeNull();
    expect(getUpnpState().externalUrl).toBeNull();
  });

  it('setManualExternalUrl updates state.externalUrl directly', () => {
    setManualExternalUrl('http://override.com');

    const state = getUpnpState();
    expect(state.externalUrl).toBe('http://override.com');
    expect(state.active).toBe(false);
  });
});
