import { createRequire } from 'node:module';
import { createServer, request as httpRequest, type Server } from 'node:http';
import { connect as tcpConnect } from 'node:net';
import { once } from 'node:events';
import { Transform, type TransformCallback } from 'node:stream';
import { chromium } from 'playwright';
import type { Result, RunOptions } from 'axe-core';
import { resolvePagePaths, validateScanTarget, type SafeTarget } from './safe-target.js';
import type { AccessibilityScanner, ScanFindingInput, ScanOutput, ScanPageOutput, ScanSeverity } from './scan.types.js';

const require = createRequire(import.meta.url);
const axeScript = require.resolve('axe-core/axe.min.js');
const axeTags: RunOptions['runOnly'] = {
  type: 'tag',
  values: ['wcag2a', 'wcag2aa', 'wcag2aaa', 'wcag21a', 'wcag21aa', 'wcag21aaa', 'wcag22a', 'wcag22aa', 'wcag22aaa']
};

export interface ScannerLimits {
  maxPages: number;
  pageTimeoutMs: number;
  maxRequestsPerPage: number;
  maxBytesPerScan: number;
  maxConcurrentScans: number;
}

const severityByImpact: Record<string, ScanSeverity> = {
  critical: 'CRITICAL',
  serious: 'SERIOUS',
  moderate: 'MODERATE',
  minor: 'MINOR'
};

function wcagTags(tags: string[]): string[] {
  return [...new Set(tags.filter((tag) =>
    /^wcag(?:2|21|22)(?:a|aa|aaa)$/.test(tag) || /^wcag\d{3}$/.test(tag)
  ))];
}

function safeText(value: string, maximum = 4000): string {
  return value
    .replace(/(?:password|token|secret|api[_-]?key)(\s*[:=]\s*)[^\s,;]+/gi, '$1[redacted]')
    .replace(/([?&](?:token|key|secret|password)=)[^&\s"'<>]+/gi, '$1[redacted]')
    .slice(0, maximum);
}

export function sanitizeCapturedHtml(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style\s*>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<textarea\b[^>]*>[\s\S]*?<\/textarea\s*>/gi, '<textarea>[redacted]</textarea>')
    .replace(/<select\b[^>]*>[\s\S]*?<\/select\s*>/gi, '<select>[redacted]</select>')
    .replace(/<input\b[^>]*>/gi, '<input>')
    .replace(/<([a-z][\w:-]*)\b[^>]*\bcontenteditable(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?[^>]*>[\s\S]*?<\/\1\s*>/gi, '<$1>[redacted]</$1>')
    .replace(/<([a-z][\w:-]*)\b[^>]*>/gi, '<$1>')
    .replace(/>([^<]+)</g, (_match, text: string) => `>${text.trim() === '[redacted]' ? '[redacted]' : text.trim() ? '[text omitted]' : ''}<`)
    .slice(0, 2000);
}

export function normalizeAxeViolations(
  violations: Result[],
  pageUrl: string
): ScanFindingInput[] {
  return violations.map((violation) => {
    const tags = wcagTags(violation.tags);
    const nodes = violation.nodes.slice(0, 20);
    const snippets = [...new Set(nodes.map((node) => sanitizeCapturedHtml(node.html)).filter(Boolean))];
    const summaries = nodes
      .map((node) => node.failureSummary)
      .filter((summary): summary is string => Boolean(summary))
      .map((summary) => safeText(summary, 1500));

    return {
      title: safeText(violation.help, 250),
      ruleId: safeText(violation.id, 120),
      description: safeText(violation.description, 2000),
      impact: violation.impact ?? null,
      severity: severityByImpact[violation.impact ?? ''] ?? 'MODERATE',
      selector: nodes.flatMap((node) => node.target).slice(0, 20).join(', ').slice(0, 2000) || null,
      snippet: snippets.slice(0, 3).join('\n').slice(0, 2000) || null,
      pageUrl,
      wcag: tags.join(', ') || null,
      wcagTags: tags,
      helpUrl: safeText(violation.helpUrl, 2048),
      failureSummary: summaries.slice(0, 3).join('\n').slice(0, 4000) || null,
      violationCount: violation.nodes.length
    };
  });
}

async function createRestrictedProxy(
  target: SafeTarget,
  maximumRequests: number,
  maximumBytes: number
): Promise<{ url: string; server: Server; exceededLimit: () => boolean }> {
  const targetPort = Number(target.url.port || (target.url.protocol === 'https:' ? 443 : 80));
  const pinnedAddress = target.ipv4Addresses[0];
  if (!pinnedAddress) throw new Error('No pinned public address is available.');
  let requestCount = 0;
  let transferredBytes = 0;
  let byteLimitExceeded = false;
  const countBytes = () => new Transform({
    transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback) {
      transferredBytes += chunk.length;
      if (transferredBytes > maximumBytes) {
        byteLimitExceeded = true;
        callback(new Error('Scanner network byte limit exceeded.'));
        return;
      }
      callback(null, chunk);
    }
  });

  const server = createServer((incoming, outgoing) => {
    requestCount += 1;
    if (requestCount > maximumRequests) {
      outgoing.writeHead(429).end();
      return;
    }
    let requestedUrl: URL;
    try {
      requestedUrl = new URL(incoming.url ?? '');
    } catch {
      outgoing.writeHead(403).end();
      return;
    }
    if (requestedUrl.origin !== target.origin || requestedUrl.port && Number(requestedUrl.port) !== targetPort) {
      outgoing.writeHead(403).end();
      return;
    }
    if (!['GET', 'HEAD'].includes(incoming.method ?? '')) {
      outgoing.writeHead(405).end();
      return;
    }

    const { 'proxy-connection': _proxyConnection, connection: _connection, host: _host, ...headers } = incoming.headers;
    const upstream = httpRequest({
      hostname: pinnedAddress,
      port: targetPort,
      method: incoming.method,
      path: `${requestedUrl.pathname}${requestedUrl.search}`,
      headers: { ...headers, host: requestedUrl.host, connection: 'close' },
      agent: false,
      timeout: 15_000
    }, (upstreamResponse) => {
      outgoing.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
      const byteCounter = countBytes();
      byteCounter.on('error', () => {
        upstream.destroy();
        outgoing.destroy();
      });
      upstreamResponse.pipe(byteCounter).pipe(outgoing);
    });
    upstream.on('error', () => outgoing.destroy());
    incoming.on('aborted', () => upstream.destroy());
    incoming.pipe(upstream);
  });

  server.on('connect', (request, clientSocket, head) => {
    requestCount += 1;
    if (requestCount > maximumRequests) {
      clientSocket.end('HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\n\r\n');
      return;
    }
    let requestedUrl: URL;
    try {
      requestedUrl = new URL(`http://${request.url ?? ''}`);
    } catch {
      clientSocket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      return;
    }
    if (requestedUrl.hostname.replace(/^\[|\]$/g, '').toLowerCase() !== target.host ||
      Number(requestedUrl.port || 443) !== targetPort || target.url.protocol !== 'https:') {
      clientSocket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      return;
    }

    const upstreamSocket = tcpConnect(targetPort, pinnedAddress);
    upstreamSocket.once('connect', () => {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length > 0) upstreamSocket.write(head);
      const browserToTarget = countBytes();
      const targetToBrowser = countBytes();
      const terminateOnLimit = () => {
        upstreamSocket.destroy();
        clientSocket.destroy();
      };
      browserToTarget.on('error', terminateOnLimit);
      targetToBrowser.on('error', terminateOnLimit);
      clientSocket.pipe(browserToTarget).pipe(upstreamSocket);
      upstreamSocket.pipe(targetToBrowser).pipe(clientSocket);
    });
    upstreamSocket.on('error', () => clientSocket.destroy());
    clientSocket.on('error', () => upstreamSocket.destroy());
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('The isolated browser proxy failed to start.');
  return {
    url: `http://127.0.0.1:${address.port}`,
    server,
    exceededLimit: () => requestCount > maximumRequests || byteLimitExceeded
  };
}

async function closeRestrictedProxy(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

export async function withPageTimeout<T>(operation: Promise<T>, timeoutMs: number, closePage: () => void): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_resolve, reject) => {
        timeout = setTimeout(() => {
          closePage();
          reject(new Error('The scan page exceeded its time limit.'));
        }, timeoutMs);
      })
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export class PlaywrightAxeScanner implements AccessibilityScanner {
  private activeScans = 0;

  constructor(
    private readonly limits: ScannerLimits,
    private readonly targetValidator: (url: string) => Promise<SafeTarget> = validateScanTarget
  ) {}

  async scan(projectUrl: string, paths: string[]): Promise<ScanOutput> {
    if (this.activeScans >= this.limits.maxConcurrentScans) {
      throw new Error('The scanner is at its configured concurrency limit.');
    }
    this.activeScans += 1;
    try {
      return await this.runScan(projectUrl, paths);
    } finally {
      this.activeScans -= 1;
    }
  }

  private async runScan(projectUrl: string, paths: string[]): Promise<ScanOutput> {
    const scanStartedAt = Date.now();
    if (paths.length === 0 || paths.length > this.limits.maxPages) {
      throw new Error('The scan page limit was exceeded.');
    }
    const safeTarget = await this.targetValidator(projectUrl);
    const pages = resolvePagePaths(safeTarget, paths);
    const proxy = await createRestrictedProxy(
      safeTarget,
      this.limits.maxRequestsPerPage * pages.length,
      this.limits.maxBytesPerScan
    );
    let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;

    try {
      browser = await chromium.launch({
        headless: true,
        chromiumSandbox: true,
        proxy: { server: proxy.url, bypass: '<-loopback>' },
        timeout: 10_000,
        args: [
          '--disable-background-networking',
          '--disable-component-update',
          '--disable-default-apps',
          '--disable-dns-prefetch',
          '--proxy-bypass-list=<-loopback>'
        ]
      });
      const context = await browser.newContext({
        acceptDownloads: false,
        javaScriptEnabled: true,
        serviceWorkers: 'block',
        viewport: { width: 1280, height: 800 }
      });
      let requestCount = 0;
      let crossOriginNavigationBlocked = false;
      await context.route('**/*', async (route) => {
        requestCount += 1;
        let requestUrl: URL;
        try {
          requestUrl = new URL(route.request().url());
        } catch {
          await route.abort('blockedbyclient');
          return;
        }
        if (
          requestUrl.origin !== safeTarget.origin ||
          !['GET', 'HEAD'].includes(route.request().method()) ||
          requestCount > this.limits.maxRequestsPerPage ||
          route.request().resourceType() === 'media'
        ) {
          if (requestUrl.origin !== safeTarget.origin && route.request().resourceType() === 'document') {
            crossOriginNavigationBlocked = true;
          }
          await route.abort('blockedbyclient');
          return;
        }
        await route.continue();
      });

      const page = await context.newPage();
      page.setDefaultNavigationTimeout(this.limits.pageTimeoutMs);
      page.setDefaultTimeout(this.limits.pageTimeoutMs);
      let unsafeProtocolNavigation = false;
      page.on('framenavigated', (frame) => {
        if (frame !== page.mainFrame() || frame.url() === 'about:blank') return;
        try {
          if (!['http:', 'https:'].includes(new URL(frame.url()).protocol)) {
            unsafeProtocolNavigation = true;
            void page.close();
          }
        } catch {
          unsafeProtocolNavigation = true;
          void page.close();
        }
      });
      page.on('response', (response) => {
        try {
          if (new URL(response.url()).origin !== safeTarget.origin) crossOriginNavigationBlocked = true;
        } catch {
          crossOriginNavigationBlocked = true;
        }
        const location = response.headers().location;
        if (!location || response.status() < 300 || response.status() >= 400) return;
        try {
          const redirect = new URL(location, response.url());
          if (redirect.origin !== safeTarget.origin || redirect.search !== '' || redirect.hash !== '') {
            crossOriginNavigationBlocked = true;
          }
        } catch {
          crossOriginNavigationBlocked = true;
        }
      });
      const findings: ScanFindingInput[] = [];
      const pageResults: ScanPageOutput[] = [];
      let incompleteCount = 0;
      let passedCount = 0;

      for (const pageUrl of pages) {
        const pageStartedAt = Date.now();
        const result = await withPageTimeout((async () => {
          requestCount = 0;
          crossOriginNavigationBlocked = false;
          const navigationResponse = await page.goto(pageUrl.toString(), { waitUntil: 'domcontentloaded' });
          if (navigationResponse && navigationResponse.status() >= 300 && navigationResponse.status() < 400) {
            const location = navigationResponse.headers().location;
            if (location) {
              const redirect = new URL(location, navigationResponse.url());
              if (redirect.origin !== safeTarget.origin || redirect.search !== '' || redirect.hash !== '') {
                crossOriginNavigationBlocked = true;
              }
            }
          }
          if (crossOriginNavigationBlocked) throw new Error('A cross-origin redirect was blocked.');
          if (unsafeProtocolNavigation) throw new Error('A non-web navigation was blocked.');
          await page.addScriptTag({ path: axeScript });
          const results = await page.evaluate(async (tags) => {
            const axe = (window as Window & { axe?: { run: (context: Document, options: unknown) => Promise<unknown> } }).axe;
            if (!axe) throw new Error('Accessibility engine was not loaded.');
            return axe.run(document, { runOnly: tags });
          }, axeTags) as { violations: Result[]; incomplete: unknown[]; passes: unknown[] };
          return { results, finalUrl: page.url(), title: await page.title() };
        })(), this.limits.pageTimeoutMs, () => { void page.close(); });
        if (unsafeProtocolNavigation) throw new Error('A non-web navigation was blocked.');
        if (proxy.exceededLimit()) throw new Error('The scan request limit was exceeded.');
        const finalUrl = new URL(result.finalUrl);
        if (finalUrl.origin !== safeTarget.origin || finalUrl.search || finalUrl.hash) throw new Error('The final page URL was not allowed.');
        const sanitizedFinalUrl = finalUrl.toString();
        findings.push(...normalizeAxeViolations(result.results.violations, sanitizedFinalUrl));
        incompleteCount += result.results.incomplete.length;
        passedCount += result.results.passes.length;
        pageResults.push({
          requestedUrl: pageUrl.toString(), finalUrl: sanitizedFinalUrl,
          title: safeText(result.title, 250) || null,
          durationMs: Math.max(0, Date.now() - pageStartedAt),
          passedCount: result.results.passes.length,
          incompleteCount: result.results.incomplete.length
        });
      }

      await context.close();
      return { findings, incompleteCount, pageCount: pages.length, passedCount, durationMs: Math.max(0, Date.now() - scanStartedAt), pages: pageResults };
    } finally {
      try {
        if (browser) await browser.close();
      } finally {
        await closeRestrictedProxy(proxy.server);
      }
    }
  }
}

export function scoreAccessibility(findings: ReadonlyArray<Pick<ScanFindingInput, 'severity' | 'violationCount'>>): number {
  const penaltyBySeverity: Record<ScanSeverity, number> = {
    CRITICAL: 10,
    SERIOUS: 5,
    MODERATE: 2,
    MINOR: 1
  };
  const penalty = findings.reduce(
    (total, finding) => total + penaltyBySeverity[finding.severity] * finding.violationCount,
    0
  );
  return Math.max(0, 100 - penalty);
}
