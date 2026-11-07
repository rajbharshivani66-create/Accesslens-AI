import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import type { AuthIdentity } from '../modules/auth/auth.types.js';
import type { DashboardRepository } from '../modules/dashboard/dashboard.repository.js';
import type { ProjectRepository } from '../modules/projects/project.repository.js';
import { ScanService } from '../modules/scans/scan.service.js';
import type { AccessibilityScanner, ScanDetails, ScanOutput, ScanRepository, ScanSummary, ScanWithProject } from '../modules/scans/scan.types.js';
import type { TeamRepository } from '../modules/teams/team.repository.js';

const servers: Server[] = [];

class MemoryScanRepository implements ScanRepository {
  private scans = new Map<string, ScanDetails>();
  private nextId = 1;

  async createScan(userId: string, projectId: string, paths: string[]): Promise<ScanSummary | null> {
    if (userId !== 'profile-valid-owner' || projectId !== 'project-1') return null;
    const id = `scan-${this.nextId++}`;
    const now = new Date();
    const details: ScanDetails = {
      id,
      projectId,
      status: 'QUEUED',
      score: 0,
      startedAt: now,
      completedAt: null,
      errorMessage: null,
      pageCount: paths.length,
      incompleteCount: 0,
      passedCount: 0,
      durationMs: null,
      paths,
      findingCount: 0,
      createdAt: now,
      pages: [],
      findings: []
    };
    this.scans.set(id, details);
    const { findings: _findings, pages: _pages, ...summary } = details;
    return summary;
  }

  async claimNextScan(): Promise<ScanWithProject | null> {
    const scan = [...this.scans.values()].find((item) => item.status === 'QUEUED');
    if (!scan) return null;
    scan.status = 'IN_PROGRESS';
    const { findings: _findings, pages: _pages, ...summary } = scan;
    return { ...summary, projectUrl: 'https://public.example/', requestedById: 'profile-valid-owner', verificationForFindingId: null };
  }

  async failStaleScans(): Promise<number> {
    return 0;
  }

  async listProjectScans(userId: string, projectId: string): Promise<{ items: ScanSummary[]; total: number } | null> {
    if (userId !== 'profile-valid-owner' || projectId !== 'project-1') return null;
    const items = [...this.scans.values()].filter((scan) => scan.projectId === projectId).map(({ findings: _findings, pages: _pages, ...summary }) => summary);
    return { items, total: items.length };
  }

  async listScans(userId: string): Promise<{ items: ScanSummary[]; total: number }> {
    const items = userId === 'profile-valid-owner' ? [...this.scans.values()].map(({ findings: _findings, pages: _pages, ...summary }) => summary) : [];
    return { items, total: items.length };
  }

  async getScan(userId: string, scanId: string): Promise<ScanDetails | null> {
    if (userId !== 'profile-valid-owner') return null;
    return this.scans.get(scanId) ?? null;
  }

  async completeScan(scanId: string, result: ScanOutput): Promise<void> {
    const scan = this.scans.get(scanId)!;
    scan.status = 'COMPLETED';
    scan.completedAt = new Date();
    scan.pageCount = result.pageCount;
    scan.incompleteCount = result.incompleteCount;
    scan.passedCount = result.passedCount ?? 0;
    scan.durationMs = result.durationMs ?? null;
    scan.pages = (result.pages ?? []).map((page, index) => ({ ...page, id: `${scanId}-page-${index + 1}`, status: 'COMPLETED', createdAt: new Date() }));
    scan.findings = result.findings.map((finding, index) => ({
      ...finding,
      id: `${scanId}-finding-${index + 1}`,
      status: 'OPEN',
      createdAt: new Date()
    }));
    scan.findingCount = scan.findings.length;
    scan.score = 100;
  }

  async failScan(scanId: string, message: string, durationMs?: number): Promise<void> {
    const scan = this.scans.get(scanId)!;
    scan.status = 'FAILED';
    scan.completedAt = new Date();
    scan.errorMessage = message;
    scan.durationMs = durationMs ?? null;
  }
}

async function startApi(scanService: ScanService): Promise<string> {
  const app = createApp({
    repository: {
      ping: async () => undefined,
      ensureProfile: async (identity: AuthIdentity) => ({
        id: `profile-${identity.id}`,
        authUserId: identity.id,
        email: identity.email,
        fullName: null,
        avatarUrl: null,
        role: 'MEMBER',
        createdAt: new Date(),
        updatedAt: new Date()
      })
    } as ProjectRepository,
    dashboardRepository: {} as DashboardRepository,
    teamRepository: {} as TeamRepository,
    verifyAccessToken: async (token) => token.startsWith('valid-')
      ? { id: token, email: `${token}@example.test`, emailVerified: true }
      : null,
    scanService
  });
  const server = app.listen(0);
  servers.push(server);
  await once(server, 'listening');
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

const headers = {
  authorization: 'Bearer valid-owner',
  'content-type': 'application/json'
};

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  })));
});

describe('scan API workflows', () => {
  it('creates a persisted scan result and returns history and details to an authorized user', async () => {
    const repository = new MemoryScanRepository();
    const scanner: AccessibilityScanner = {
      scan: vi.fn(async (): Promise<ScanOutput> => ({
        findings: [{
          title: 'Images need alt text', ruleId: 'image-alt', description: 'Add an alt attribute.',
          impact: 'critical', severity: 'CRITICAL', selector: 'img.logo', snippet: '<img>',
          pageUrl: 'https://public.example/', wcag: 'wcag2a, wcag111', wcagTags: ['wcag2a', 'wcag111'],
          helpUrl: 'https://dequeuniversity.com/rules/axe/image-alt', failureSummary: 'Fix this image.',
          violationCount: 1
        }],
        incompleteCount: 2,
        pageCount: 1,
        passedCount: 24,
        durationMs: 1600,
        pages: [{ requestedUrl: 'https://public.example/', finalUrl: 'https://public.example/', title: 'Example', durationMs: 1600, passedCount: 24, incompleteCount: 2 }]
      }))
    };
    const service = new ScanService(repository, scanner, 2);
    const baseUrl = await startApi(service);
    const response = await fetch(`${baseUrl}/api/scans`, {
      method: 'POST', headers, body: JSON.stringify({ projectId: 'project-1', paths: ['/'] })
    });
    expect(response.status).toBe(202);
    const created = (await response.json() as { data: ScanSummary }).data;
    expect(created.status).toBe('QUEUED');
    expect(scanner.scan).not.toHaveBeenCalled();
    expect(await service.processNextQueuedScan()).toBe(true);

    const history = await fetch(`${baseUrl}/api/projects/project-1/scans`, { headers });
    expect((await history.json() as { data: { total: number } }).data.total).toBe(1);
    const accessibleHistory = await fetch(`${baseUrl}/api/scans`, { headers });
    expect((await accessibleHistory.json() as { data: { total: number } }).data.total).toBe(1);
    const detail = await fetch(`${baseUrl}/api/scans/${created.id}`, { headers });
    const scanDetail = (await detail.json() as { data: ScanDetails }).data;
    expect(scanDetail.findings[0]?.ruleId).toBe('image-alt');
    expect(scanDetail).toMatchObject({ passedCount: 24, durationMs: 1600, pages: [{ title: 'Example', finalUrl: 'https://public.example/' }] });
    expect(scanner.scan).toHaveBeenCalledWith('https://public.example/', ['/']);
  });

  it('rejects unauthenticated direct API scan access and excessive page counts', async () => {
    const scanner: AccessibilityScanner = { scan: vi.fn(async () => ({ findings: [], incompleteCount: 0, pageCount: 1 })) };
    const baseUrl = await startApi(new ScanService(new MemoryScanRepository(), scanner, 1));
    expect((await fetch(`${baseUrl}/api/projects/project-1/scans`, { method: 'POST', body: '{}' })).status).toBe(401);
    expect((await fetch(`${baseUrl}/api/scans`, { method: 'POST', body: '{}' })).status).toBe(401);

    const tooMany = await fetch(`${baseUrl}/api/projects/project-1/scans`, {
      method: 'POST', headers, body: JSON.stringify({ paths: ['/', '/about'] })
    });
    expect(tooMany.status).toBe(400);
    expect(scanner.scan).not.toHaveBeenCalled();
  });

  it('validates root scan requests and rejects unreadable project IDs', async () => {
    const scanner: AccessibilityScanner = { scan: vi.fn(async () => ({ findings: [], incompleteCount: 0, pageCount: 1 })) };
    const baseUrl = await startApi(new ScanService(new MemoryScanRepository(), scanner, 1));
    const invalid = await fetch(`${baseUrl}/api/scans`, { method: 'POST', headers, body: JSON.stringify({ projectId: 'project-1', paths: ['https://other.example/'] }) });
    const foreign = await fetch(`${baseUrl}/api/scans`, { method: 'POST', headers, body: JSON.stringify({ projectId: 'other-team' }) });
    expect(invalid.status).toBe(400);
    expect(foreign.status).toBe(404);
    expect(scanner.scan).not.toHaveBeenCalled();
  });

  it('records failures and allows authorized retry of failed scans', async () => {
    const repository = new MemoryScanRepository();
    const scanner: AccessibilityScanner = {
      scan: vi.fn()
        .mockRejectedValueOnce(new Error('browser internals'))
        .mockResolvedValueOnce({ findings: [], incompleteCount: 0, pageCount: 1 })
    };
    const service = new ScanService(repository, scanner, 2);
    const baseUrl = await startApi(service);
    const firstResponse = await fetch(`${baseUrl}/api/projects/project-1/scans`, {
      method: 'POST', headers, body: JSON.stringify({ paths: ['/', '/about'] })
    });
    const queued = (await firstResponse.json() as { data: ScanSummary }).data;
    expect(queued.status).toBe('QUEUED');
    await service.processNextQueuedScan();
    const first = await service.getScan('profile-valid-owner', queued.id) as ScanDetails;
    expect(first.status).toBe('FAILED');
    expect(first.errorMessage).not.toContain('browser internals');

    const retry = await fetch(`${baseUrl}/api/scans/${first.id}/retry`, { method: 'POST', headers });
    expect(retry.status).toBe(202);
    const retryScan = (await retry.json() as { data: ScanSummary }).data;
    expect(retryScan.status).toBe('QUEUED');
    await service.processNextQueuedScan();
    expect((await service.getScan('profile-valid-owner', retryScan.id))?.status).toBe('COMPLETED');
    expect(scanner.scan).toHaveBeenNthCalledWith(2, 'https://public.example/', ['/', '/about']);
  });

  it('does not allow a viewer or another user to start or read scans by guessing IDs', async () => {
    const scanner: AccessibilityScanner = { scan: vi.fn(async () => ({ findings: [], incompleteCount: 0, pageCount: 1 })) };
    const baseUrl = await startApi(new ScanService(new MemoryScanRepository(), scanner, 1));
    const viewerHeaders = { ...headers, authorization: 'Bearer valid-viewer' };
    const forbidden = await fetch(`${baseUrl}/api/projects/project-1/scans`, {
      method: 'POST', headers: viewerHeaders, body: JSON.stringify({})
    });
    expect(forbidden.status).toBe(404);
    expect((await fetch(`${baseUrl}/api/scans/scan-1`, { headers: viewerHeaders })).status).toBe(404);
    expect(scanner.scan).not.toHaveBeenCalled();
  });

  it('processes durable queued scans through the worker loop', async () => {
    const repository = new MemoryScanRepository();
    const scanner: AccessibilityScanner = {
      scan: vi.fn(async (): Promise<ScanOutput> => ({ findings: [], incompleteCount: 0, pageCount: 1 }))
    };
    const service = new ScanService(repository, scanner, 1);
    const queued = await service.startScan('profile-valid-owner', 'project-1');
    expect(queued?.status).toBe('QUEUED');
    const stopWorker = service.startWorker(5);
    try {
      let latest = await service.getScan('profile-valid-owner', queued!.id);
      for (let attempt = 0; attempt < 100 && latest?.status !== 'COMPLETED'; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 5));
        latest = await service.getScan('profile-valid-owner', queued!.id);
      }
      expect(latest?.status).toBe('COMPLETED');
      expect(scanner.scan).toHaveBeenCalledOnce();
    } finally {
      await stopWorker();
    }
  });
});
