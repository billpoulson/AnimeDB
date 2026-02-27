import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/config', () => ({
  config: {
    port: 3000,
    externalUrl: '',
    authDisabled: true,
  },
}));

describe('UPnP Service - state management', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('exports expected functions', async () => {
    const upnp = await import('../src/services/upnp');
    expect(typeof upnp.startUpnp).toBe('function');
    expect(typeof upnp.stopUpnp).toBe('function');
    expect(typeof upnp.getUpnpState).toBe('function');
    expect(typeof upnp.getExternalUrl).toBe('function');
    expect(typeof upnp.setManualExternalUrl).toBe('function');
  });

  it('getUpnpState returns initial inactive state', async () => {
    const upnp = await import('../src/services/upnp');
    const state = upnp.getUpnpState();

    expect(state.active).toBe(false);
    expect(state.externalIp).toBeNull();
    expect(state.externalUrl).toBeNull();
    expect(state.error).toBeNull();
  });

  it('getExternalUrl returns null initially', async () => {
    const upnp = await import('../src/services/upnp');
    expect(upnp.getExternalUrl()).toBeNull();
  });

  it('setManualExternalUrl sets the external URL', async () => {
    const upnp = await import('../src/services/upnp');

    upnp.setManualExternalUrl('http://manual.example.com');
    expect(upnp.getExternalUrl()).toBe('http://manual.example.com');
  });

  it('setManualExternalUrl clears URL with null', async () => {
    const upnp = await import('../src/services/upnp');

    upnp.setManualExternalUrl('http://temp.com');
    expect(upnp.getExternalUrl()).toBe('http://temp.com');

    upnp.setManualExternalUrl(null);
    expect(upnp.getExternalUrl()).toBeNull();
  });

  it('setManualExternalUrl clears URL with empty string', async () => {
    const upnp = await import('../src/services/upnp');

    upnp.setManualExternalUrl('http://temp.com');
    upnp.setManualExternalUrl('');
    expect(upnp.getExternalUrl()).toBeNull();
  });

  it('getUpnpState returns a copy, not a reference', async () => {
    const upnp = await import('../src/services/upnp');
    const state1 = upnp.getUpnpState();
    const state2 = upnp.getUpnpState();
    expect(state1).not.toBe(state2);
    expect(state1).toEqual(state2);
  });

  it('startUpnp skips UPnP when manual URL is set', async () => {
    const upnp = await import('../src/services/upnp');
    upnp.setManualExternalUrl('http://manual.test:3000');

    await upnp.startUpnp();

    expect(upnp.getExternalUrl()).toBe('http://manual.test:3000');
    const state = upnp.getUpnpState();
    expect(state.active).toBe(false);
    expect(state.error).toBeNull();
  });

  it('stopUpnp is a no-op when not active', async () => {
    const upnp = await import('../src/services/upnp');
    await upnp.stopUpnp();
    expect(upnp.getUpnpState().active).toBe(false);
  });
});
