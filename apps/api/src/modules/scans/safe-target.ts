import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import ipaddr from 'ipaddr.js';

export class UnsafeScanTargetError extends Error {
  constructor() {
    super('The scan target is not allowed.');
    this.name = 'UnsafeScanTargetError';
  }
}

export interface SafeTarget {
  url: URL;
  origin: string;
  host: string;
  ipv4Addresses: string[];
}

type Resolver = (hostname: string) => Promise<Array<{ address: string; family: number }>>;

const resolveAll: Resolver = async (hostname) => dnsLookup(hostname, { all: true, verbatim: true });

function publicAddress(address: string): boolean {
  try {
    return ipaddr.parse(address).range() === 'unicast';
  } catch {
    return false;
  }
}

function allowedPort(url: URL): boolean {
  return url.port === '' ||
    (url.protocol === 'http:' && url.port === '80') ||
    (url.protocol === 'https:' && url.port === '443');
}

export async function validateScanTarget(rawUrl: string, resolve: Resolver = resolveAll): Promise<SafeTarget> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new UnsafeScanTargetError();
  }

  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username !== '' ||
    url.password !== '' ||
    url.search !== '' ||
    url.hash !== '' ||
    !allowedPort(url)
  ) {
    throw new UnsafeScanTargetError();
  }

  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new UnsafeScanTargetError();
  }

  let addresses: Array<{ address: string; family: number }>;
  if (isIP(host)) {
    addresses = [{ address: host, family: isIP(host) }];
  } else {
    try {
      addresses = await resolve(host);
    } catch {
      throw new UnsafeScanTargetError();
    }
  }

  if (addresses.length === 0 || addresses.some(({ address }) => !publicAddress(address))) {
    throw new UnsafeScanTargetError();
  }

  // Pin Chromium to public IPv4 answers validated above. IPv6-only targets are
  // rejected until the worker can pin and enforce IPv6 addresses equivalently.
  const ipv4Addresses = [...new Set(addresses
    .filter(({ family }) => family === 4)
    .map(({ address }) => address))];
  if (ipv4Addresses.length === 0) throw new UnsafeScanTargetError();

  return {
    url,
    origin: url.origin,
    host,
    ipv4Addresses
  };
}

export function resolvePagePaths(base: SafeTarget, paths: string[]): URL[] {
  return paths.map((path) => {
    let target: URL;
    try {
      target = new URL(path, base.url);
    } catch {
      throw new UnsafeScanTargetError();
    }
    if (
      target.origin !== base.origin ||
      target.username !== '' ||
      target.password !== '' ||
      target.search !== '' ||
      target.hash !== ''
    ) {
      throw new UnsafeScanTargetError();
    }
    return target;
  });
}
