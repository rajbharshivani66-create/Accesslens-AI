import { describe, expect, it } from 'vitest';
import { resolvePagePaths, UnsafeScanTargetError, validateScanTarget } from '../modules/scans/safe-target.js';

describe('safe website targets', () => {
  it.each([
    'http://localhost/',
    'http://127.0.0.1/',
    'http://10.1.2.3/',
    'http://172.20.1.3/',
    'http://192.168.0.1/',
    'http://169.254.169.254/latest/meta-data/',
    'http://100.100.100.200/metadata/',
    'http://198.18.0.1/',
    'http://0.0.0.0/',
    'http://224.0.0.1/',
    'http://[::1]/',
    'file:///C:/Windows/win.ini',
    'https://user:secret@example.com/',
    'https://example.com:8443/',
    'https://example.com/?token=secret',
    'https://example.com/#private'
  ])('blocks unsafe target %s', async (url) => {
    await expect(validateScanTarget(url)).rejects.toBeInstanceOf(UnsafeScanTargetError);
  });

  it('blocks DNS answers that include a private address and pins validated public IPv4', async () => {
    await expect(validateScanTarget('https://scan.example/', async () => [
      { address: '93.184.216.34', family: 4 },
      { address: '10.0.0.8', family: 4 }
    ])).rejects.toBeInstanceOf(UnsafeScanTargetError);

    const target = await validateScanTarget('https://scan.example/', async () => [
      { address: '93.184.216.34', family: 4 },
      { address: '2606:4700:4700::1111', family: 6 }
    ]);
    expect(target.ipv4Addresses).toEqual(['93.184.216.34']);
  });

  it('requires all requested pages to remain on the exact origin and omit query data', async () => {
    const target = await validateScanTarget('https://scan.example/', async () => [
      { address: '93.184.216.34', family: 4 }
    ]);
    expect(resolvePagePaths(target, ['/', '/about'])).toHaveLength(2);
    expect(() => resolvePagePaths(target, ['//other.example/'])).toThrow(UnsafeScanTargetError);
    expect(() => resolvePagePaths(target, ['/page?token=secret'])).toThrow(UnsafeScanTargetError);
  });

  it('blocks DNS failures and IPv6-only targets until address pinning is supported', async () => {
    await expect(validateScanTarget('https://missing.example/', async () => {
      throw new Error('private DNS detail');
    })).rejects.toBeInstanceOf(UnsafeScanTargetError);
    await expect(validateScanTarget('https://v6.example/', async () => [
      { address: '2606:4700:4700::1111', family: 6 }
    ])).rejects.toBeInstanceOf(UnsafeScanTargetError);
  });
});
