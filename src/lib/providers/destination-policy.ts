import dns from 'node:dns/promises';
import net from 'node:net';

type AddressLookup = (hostname: string) => Promise<string[]>;

const defaultLookup: AddressLookup = async (hostname) => {
  const results = await dns.lookup(hostname, { all: true, verbatim: true });
  return results.map((result) => result.address);
};

function isUnsafeIpv4(address: string): boolean {
  const octets = address.split('.').map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part))) return true;
  const [a, b] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

function isLoopbackAddress(address: string): boolean {
  return address === '::1' || address.startsWith('127.');
}

function isUnsafeAddress(address: string): boolean {
  if (net.isIPv4(address)) return isUnsafeIpv4(address);
  if (!net.isIPv6(address)) return true;

  const normalized = address.toLowerCase();
  return (
    normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe8') ||
    normalized.startsWith('fe9') ||
    normalized.startsWith('fea') ||
    normalized.startsWith('feb') ||
    normalized.startsWith('ff')
  );
}

export async function assertSafeProviderUrl(
  input: string,
  lookup: AddressLookup = defaultLookup
): Promise<URL> {
  const url = new URL(input);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Provider URL must use HTTP or HTTPS.');
  }
  if (url.username || url.password) {
    throw new Error('Provider URL must not contain credentials.');
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const addresses = await lookup(hostname);
  if (addresses.length === 0) {
    throw new Error('Provider hostname did not resolve.');
  }

  const isLoopbackHost =
    hostname === 'localhost' || addresses.every(isLoopbackAddress);
  if (url.protocol === 'http:' && !isLoopbackHost) {
    throw new Error('Plain HTTP is only allowed for loopback providers.');
  }
  if (!isLoopbackHost && addresses.some(isUnsafeAddress)) {
    throw new Error('Private, local, or metadata provider destinations are not allowed.');
  }

  return url;
}

export async function safeProviderFetch(
  input: string,
  init: RequestInit = {},
  maxRedirects = 3,
  fetcher: typeof fetch = fetch
): Promise<Response> {
  let current = await assertSafeProviderUrl(input);

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount++) {
    const response = await fetcher(current, { ...init, redirect: 'manual' });
    if (response.status < 300 || response.status >= 400) return response;

    const location = response.headers.get('location');
    if (!location) return response;
    if (redirectCount === maxRedirects) throw new Error('Too many provider redirects.');
    const next = new URL(location, current);
    if (next.origin !== current.origin) {
      throw new Error('Cross-origin provider redirects are not allowed.');
    }
    current = await assertSafeProviderUrl(next.toString());
  }

  throw new Error('Too many provider redirects.');
}
