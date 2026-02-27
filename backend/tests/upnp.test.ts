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
  retryUpnp,
  getUpnpState,
  getExternalUrl,
  setManualExternalUrl,
  onRenew,
  MAPPING_TTL,
  RENEWAL_INTERVAL,
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
    expect(opts.ttl).toBe(MAPPING_TTL);
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

describe('UPnP Service - retryUpnp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await stopUpnp();
    setManualExternalUrl(null);
  });

  it('maps an alternate external port to the internal port', async () => {
    mockPortMapping.mockImplementation((_opts: any, cb: Function) => cb(null));
    mockExternalIp.mockImplementation((cb: Function) => cb(null, '1.2.3.4'));

    const result = await retryUpnp(3001);

    expect(result.active).toBe(true);
    expect(result.externalPort).toBe(3001);
    expect(result.externalUrl).toBe('http://1.2.3.4:3001');

    const mapOpts = mockPortMapping.mock.calls[0][0];
    expect(mapOpts.public).toBe(3001);
    expect(mapOpts.private).toBe(3000);
  });

  it('returns error state when alternate port fails', async () => {
    mockPortMapping.mockImplementation((_opts: any, cb: Function) => cb(new Error('Port in use')));

    const result = await retryUpnp(8080);

    expect(result.active).toBe(false);
    expect(result.error).toBe('Port in use');
  });

  it('cleans up previous alternate port mapping when switching ports', async () => {
    mockPortMapping.mockImplementation((_opts: any, cb: Function) => cb(null));
    mockExternalIp.mockImplementation((cb: Function) => cb(null, '1.2.3.4'));

    await retryUpnp(3001);
    expect(getUpnpState().externalPort).toBe(3001);

    mockPortUnmapping.mockClear();
    await retryUpnp(3002);

    const unmapPorts = mockPortUnmapping.mock.calls.map((c: any[]) => c[0].public);
    expect(unmapPorts).toContain(3001);
    expect(unmapPorts).toContain(3002);
    expect(getUpnpState().externalPort).toBe(3002);
  });

  it('stopUpnp unmaps the alternate port', async () => {
    mockPortMapping.mockImplementation((_opts: any, cb: Function) => cb(null));
    mockExternalIp.mockImplementation((cb: Function) => cb(null, '1.2.3.4'));

    await retryUpnp(4000);

    mockPortUnmapping.mockClear();
    await stopUpnp();

    expect(mockPortUnmapping).toHaveBeenCalledTimes(1);
    expect(mockPortUnmapping.mock.calls[0][0].public).toBe(4000);
  });

  it('state includes externalPort after successful mapping', async () => {
    mockPortMapping.mockImplementation((_opts: any, cb: Function) => cb(null));
    mockExternalIp.mockImplementation((cb: Function) => cb(null, '5.6.7.8'));

    await startUpnp();
    expect(getUpnpState().externalPort).toBe(3000);

    await retryUpnp(9090);
    expect(getUpnpState().externalPort).toBe(9090);
    expect(getUpnpState().externalUrl).toBe('http://5.6.7.8:9090');
  });
});

describe('UPnP Service - lease renewal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(async () => {
    vi.useRealTimers();
    await stopUpnp();
    setManualExternalUrl(null);
  });

  it('exports MAPPING_TTL > 0 and a RENEWAL_INTERVAL', () => {
    expect(MAPPING_TTL).toBeGreaterThan(0);
    expect(RENEWAL_INTERVAL).toBeGreaterThan(0);
    expect(RENEWAL_INTERVAL).toBeLessThan(MAPPING_TTL * 1000);
  });

  it('renews mapping after RENEWAL_INTERVAL', async () => {
    mockPortMapping.mockImplementation((_opts: any, cb: Function) => cb(null));
    mockExternalIp.mockImplementation((cb: Function) => cb(null, '1.2.3.4'));

    await startUpnp();
    expect(getUpnpState().active).toBe(true);

    const initialMapCalls = mockPortMapping.mock.calls.length;

    await vi.advanceTimersByTimeAsync(RENEWAL_INTERVAL);

    expect(mockPortMapping.mock.calls.length).toBeGreaterThan(initialMapCalls);
    expect(getUpnpState().active).toBe(true);
  });

  it('renewal uses correct TTL', async () => {
    mockPortMapping.mockImplementation((_opts: any, cb: Function) => cb(null));
    mockExternalIp.mockImplementation((cb: Function) => cb(null, '1.2.3.4'));

    await startUpnp();

    mockPortMapping.mockClear();
    await vi.advanceTimersByTimeAsync(RENEWAL_INTERVAL);

    expect(mockPortMapping).toHaveBeenCalledTimes(1);
    expect(mockPortMapping.mock.calls[0][0].ttl).toBe(MAPPING_TTL);
  });

  it('keeps state active when renewal succeeds', async () => {
    mockPortMapping.mockImplementation((_opts: any, cb: Function) => cb(null));
    mockExternalIp.mockImplementation((cb: Function) => cb(null, '1.2.3.4'));

    await startUpnp();

    await vi.advanceTimersByTimeAsync(RENEWAL_INTERVAL);

    const state = getUpnpState();
    expect(state.active).toBe(true);
    expect(state.externalIp).toBe('1.2.3.4');
  });

  it('stays active when renewal fails (will retry next interval)', async () => {
    mockPortMapping.mockImplementation((_opts: any, cb: Function) => cb(null));
    mockExternalIp.mockImplementation((cb: Function) => cb(null, '1.2.3.4'));

    await startUpnp();
    expect(getUpnpState().active).toBe(true);

    mockPortMapping.mockImplementation((_opts: any, cb: Function) => cb(new Error('Renewal failed')));

    await vi.advanceTimersByTimeAsync(RENEWAL_INTERVAL);

    // State stays active so next renewal can try again
    expect(getUpnpState().active).toBe(true);
  });

  it('detects IP change during renewal', async () => {
    mockPortMapping.mockImplementation((_opts: any, cb: Function) => cb(null));
    mockExternalIp.mockImplementation((cb: Function) => cb(null, '1.2.3.4'));

    await startUpnp();
    expect(getUpnpState().externalIp).toBe('1.2.3.4');

    mockExternalIp.mockImplementation((cb: Function) => cb(null, '5.6.7.8'));

    await vi.advanceTimersByTimeAsync(RENEWAL_INTERVAL);

    expect(getUpnpState().externalIp).toBe('5.6.7.8');
    expect(getUpnpState().externalUrl).toBe('http://5.6.7.8:3000');
  });

  it('fires onRenew callback after successful renewal', async () => {
    mockPortMapping.mockImplementation((_opts: any, cb: Function) => cb(null));
    mockExternalIp.mockImplementation((cb: Function) => cb(null, '1.2.3.4'));

    const renewCallback = vi.fn();
    onRenew(renewCallback);

    await startUpnp();
    expect(renewCallback).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(RENEWAL_INTERVAL);

    expect(renewCallback).toHaveBeenCalledTimes(1);
  });

  it('does not fire onRenew when renewal fails', async () => {
    mockPortMapping.mockImplementation((_opts: any, cb: Function) => cb(null));
    mockExternalIp.mockImplementation((cb: Function) => cb(null, '1.2.3.4'));

    const renewCallback = vi.fn();
    onRenew(renewCallback);

    await startUpnp();

    mockPortMapping.mockImplementation((_opts: any, cb: Function) => cb(new Error('fail')));

    await vi.advanceTimersByTimeAsync(RENEWAL_INTERVAL);

    expect(renewCallback).not.toHaveBeenCalled();
  });

  it('stopUpnp cancels the renewal timer', async () => {
    mockPortMapping.mockImplementation((_opts: any, cb: Function) => cb(null));
    mockExternalIp.mockImplementation((cb: Function) => cb(null, '1.2.3.4'));

    await startUpnp();
    const mapCallsAfterStart = mockPortMapping.mock.calls.length;

    await stopUpnp();

    mockPortMapping.mockClear();
    await vi.advanceTimersByTimeAsync(RENEWAL_INTERVAL * 3);

    expect(mockPortMapping).not.toHaveBeenCalled();
  });

  it('setManualExternalUrl stops renewal loop', async () => {
    mockPortMapping.mockImplementation((_opts: any, cb: Function) => cb(null));
    mockExternalIp.mockImplementation((cb: Function) => cb(null, '1.2.3.4'));

    await startUpnp();

    setManualExternalUrl('http://manual.test');
    mockPortMapping.mockClear();

    await vi.advanceTimersByTimeAsync(RENEWAL_INTERVAL * 3);

    expect(mockPortMapping).not.toHaveBeenCalled();
  });

  it('renews multiple times over several intervals', async () => {
    mockPortMapping.mockImplementation((_opts: any, cb: Function) => cb(null));
    mockExternalIp.mockImplementation((cb: Function) => cb(null, '1.2.3.4'));

    await startUpnp();
    const initialCalls = mockPortMapping.mock.calls.length;

    await vi.advanceTimersByTimeAsync(RENEWAL_INTERVAL * 3);

    expect(mockPortMapping.mock.calls.length).toBe(initialCalls + 3);
  });
});
