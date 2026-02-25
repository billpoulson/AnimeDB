import { describe, it, expect } from 'vitest';
import { parseProgress } from '../src/services/downloader';

describe('parseProgress', () => {
  it('parses a standard progress line with speed and ETA', () => {
    const result = parseProgress(
      '[download]  45.2% of ~123.45MiB at 5.67MiB/s ETA 00:15'
    );
    expect(result).toEqual({
      percent: 45,
      speed: '5.67MiB/s',
      eta: '00:15',
    });
  });

  it('parses 100% progress line', () => {
    const result = parseProgress('[download] 100% of 123.45MiB in 00:30');
    expect(result).toEqual({
      percent: 100,
      speed: undefined,
      eta: undefined,
    });
  });

  it('parses single-digit percent', () => {
    const result = parseProgress(
      '[download]   3.5% of ~200.00MiB at 1.23MiB/s ETA 02:30'
    );
    expect(result).toEqual({
      percent: 4,
      speed: '1.23MiB/s',
      eta: '02:30',
    });
  });

  it('returns null for info lines', () => {
    expect(parseProgress('[info] Extracting URL: https://...')).toBeNull();
  });

  it('returns null for merger lines', () => {
    expect(
      parseProgress('[Merger] Merging formats into "video.mkv"')
    ).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseProgress('')).toBeNull();
  });

  it('returns null for destination lines', () => {
    expect(
      parseProgress('[download] Destination: /downloads/video.webm')
    ).toBeNull();
  });

  it('parses progress without speed info', () => {
    const result = parseProgress('[download]  50% of ~100.00MiB');
    expect(result).toEqual({
      percent: 50,
      speed: undefined,
      eta: undefined,
    });
  });
});
