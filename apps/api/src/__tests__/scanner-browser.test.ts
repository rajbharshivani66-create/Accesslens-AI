import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { afterEach, describe, expect, it } from 'vitest';
import { PlaywrightAxeScanner } from '../modules/scans/playwright-axe-scanner.js';

const servers: Server[] = [];

async function listen(server: Server): Promise<number> {
  server.listen(0, '127.0.0.1');
  servers.push(server);
  await once(server, 'listening');
  return (server.address() as { port: number }).port;
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  })));
});

describe('Playwright and axe-core worker', () => {
  it('scans a controlled page and blocks cross-origin redirects and state-changing requests', async () => {
    let blockedOriginRequests = 0;
    let mutationRequests = 0;
    const blockedServer = createServer((_request, response) => {
      blockedOriginRequests += 1;
      response.end('should not be loaded');
    });
    const blockedPort = await listen(blockedServer);
    const scanServer = createServer((request, response) => {
      if (request.url === '/mutate') mutationRequests += 1;
      if (request.url === '/redirect') {
        response.writeHead(302, { location: `http://127.0.0.1:${blockedPort}/redirect-target` });
        response.end();
        return;
      }
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(`<!doctype html><html><head><title>Controlled scan fixture</title></head><body><script>fetch('/mutate',{method:'POST',body:'private'}).catch(()=>{});</script><img src="http://127.0.0.1:${blockedPort}/sensitive.png"><button></button></body></html>`);
    });
    const scanPort = await listen(scanServer);
    const projectUrl = `http://scanner.test:${scanPort}/`;
    const scanner = new PlaywrightAxeScanner({
      maxPages: 2,
      pageTimeoutMs: 10_000,
      maxRequestsPerPage: 20,
      maxBytesPerScan: 1_000_000,
      maxConcurrentScans: 1
    }, async () => ({
      url: new URL(projectUrl),
      origin: new URL(projectUrl).origin,
      host: 'scanner.test',
      ipv4Addresses: ['127.0.0.1']
    }));

    const result = await scanner.scan(projectUrl, ['/']);
    expect(result.pageCount).toBe(1);
    expect(result.pages?.[0]).toMatchObject({ requestedUrl: projectUrl, finalUrl: projectUrl, title: 'Controlled scan fixture' });
    expect(result.pages?.[0]?.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.passedCount).toBeGreaterThan(0);
    expect(result.findings.some((finding) => finding.ruleId === 'image-alt')).toBe(true);
    await expect(scanner.scan(projectUrl, ['/redirect'])).rejects.toBeDefined();
    expect(blockedOriginRequests).toBe(0);
    expect(mutationRequests).toBe(0);
  }, 30_000);
});
