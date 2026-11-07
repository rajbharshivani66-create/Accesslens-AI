import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import type { ProjectRepository } from '../modules/projects/project.repository.js';
import type { DashboardRepository } from '../modules/dashboard/dashboard.repository.js';
import type { TeamRepository } from '../modules/teams/team.repository.js';
import type { FindingItem, FindingRepository } from '../modules/findings/finding.repository.js';
import { AIFixService } from '../modules/ai-fixes/ai-fixes.service.js';

const finding: FindingItem = {
  id: 'finding-1', ruleId: 'image-alt', title: 'Images must have alternate text', description: 'Provide a text alternative.', impact: 'serious', severity: 'SERIOUS', status: 'OPEN', assignedToId: null, selector: 'img', snippet: '<img>', pageUrl: 'https://site.example/', wcag: '1.1.1', wcagTags: ['wcag111'], helpUrl: 'https://dequeuniversity.com/rules/axe/image-alt', failureSummary: null, violationCount: 1, createdAt: new Date(), updatedAt: new Date(),
  access: { writable: true, canResolve: false, projectId: 'project-1', projectName: 'Site', teamId: null, teamName: null, scanId: 'scan-1', scanStatus: 'COMPLETED', score: 90, pageUrl: 'https://site.example/', requestedPaths: ['/'], assignee: null }
};

class MemoryFindings implements FindingRepository {
  item = { ...finding };
  lastFilters: unknown;
  async list(_userId: string, filters: { page: number; pageSize: number; sortBy?: string; sortOrder?: string }) { this.lastFilters = filters; return { items: [this.item].slice((filters.page - 1) * filters.pageSize, filters.page * filters.pageSize), total: 1 }; }
  async get(_userId: string, id: string) { return id === this.item.id ? this.item : null; }
  async updateStatus(_userId: string, _id: string, status: FindingItem['status']) { this.item = { ...this.item, status }; return this.item; }
  async assign(_userId: string, _id: string, assignedToId: string | null) { this.item = { ...this.item, assignedToId }; return this.item; }
  async startVerification(_userId: string, findingId: string) { return findingId === this.item.id ? { id: 'verification-scan', projectId: 'project-1', status: 'QUEUED' } : null; }
  async listVerifications() { return []; }
}

describe('findings API', () => {
  let server: Server;
  let baseUrl: string;
  let findings: MemoryFindings;
  beforeEach(async () => {
    findings = new MemoryFindings();
    const projectRepository = {
      ensureProfile: async (identity: { id: string; email: string }) => ({ id: `profile-${identity.id}`, authUserId: identity.id, email: identity.email, fullName: null, avatarUrl: null, role: 'MEMBER' as const, createdAt: new Date(), updatedAt: new Date() }),
      ping: async () => undefined
    } as unknown as ProjectRepository;
    const app = createApp({
      repository: projectRepository,
      dashboardRepository: {} as DashboardRepository,
      teamRepository: {} as TeamRepository,
      findingRepository: findings,
      aiFixService: new AIFixService({
        getWritableFinding: async () => ({ id: 'finding-1', ruleId: 'image-alt', title: 'Image alt text', description: 'Add alternative text.', severity: 'SERIOUS', impact: 'serious', wcag: '1.1.1', wcagTags: ['wcag111'], failureSummary: null, snippet: '<img>', selector: 'img', pageUrl: 'https://site.example/' }),
        save: async (_userId, findingId, output) => ({ findingId, explanation: output.summary }),
        list: async () => []
      }, async () => JSON.stringify({ summary: 'Add alt text.', detail: 'Provide a useful description.', affectedUsers: ['Screen reader users'], wcag: ['1.1.1'], fixSteps: ['Add alt.'], rootCause: 'The image is missing an accessible name.', wcagExplanation: 'WCAG 1.1.1 requires text alternatives for images.', testInstructions: ['Check with a screen reader.'], before: '<img>', after: '<img alt="Product diagram">', htmlSuggestion: '<img src="diagram.svg" alt="Product diagram">', jsxSuggestion: '<img src="diagram.svg" alt="Product diagram" />', explanation: 'Alt text names the image.' })),
      verifyAccessToken: async (token) => token === 'valid' ? { id: 'user-1', email: 'one@example.test' } : null
    });
    server = app.listen(0); await once(server, 'listening');
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterEach(async () => { server.close(); await once(server, 'close'); });

  it('lists authorized findings with validated filters and pagination', async () => {
    const response = await fetch(`${baseUrl}/api/findings?severity=SERIOUS&page=1&pageSize=20&sortBy=severity&sortOrder=asc`, { headers: { Authorization: 'Bearer valid' } });
    expect(response.status).toBe(200);
    expect((await response.json()).data.items[0]).toMatchObject({ id: 'finding-1', wcag: '1.1.1' });
    expect(findings.lastFilters).toMatchObject({ severity: 'SERIOUS', sortBy: 'severity', sortOrder: 'asc' });
    expect((await fetch(`${baseUrl}/api/findings?pageSize=500`, { headers: { Authorization: 'Bearer valid' } })).status).toBe(400);
    expect((await fetch(`${baseUrl}/api/findings?sortBy=unsafe`, { headers: { Authorization: 'Bearer valid' } })).status).toBe(400);
  });

  it('rejects malformed finding identifiers before repository access', async () => {
    const response = await fetch(`${baseUrl}/api/findings/${'x'.repeat(129)}`, { headers: { Authorization: 'Bearer valid' } });
    expect(response.status).toBe(400);
  });

  it('allows workflow updates but requires verification before resolving', async () => {
    const response = await fetch(`${baseUrl}/api/findings/finding-1`, { method: 'PATCH', headers: { Authorization: 'Bearer valid', 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'IN_REVIEW' }) });
    expect(response.status).toBe(200);
    expect(findings.item.status).toBe('IN_REVIEW');
    const resolved = await fetch(`${baseUrl}/api/findings/finding-1`, { method: 'PATCH', headers: { Authorization: 'Bearer valid', 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'RESOLVED' }) });
    expect(resolved.status).toBe(409);
    const verify = await fetch(`${baseUrl}/api/findings/finding-1/verify`, { method: 'POST', headers: { Authorization: 'Bearer valid' } });
    expect(verify.status).toBe(202);
    expect((await verify.json()).data).toMatchObject({ id: 'verification-scan', status: 'QUEUED' });
    findings.item = { ...findings.item, access: { ...findings.item.access, canResolve: true } };
    const verifiedResolution = await fetch(`${baseUrl}/api/findings/finding-1`, { method: 'PATCH', headers: { Authorization: 'Bearer valid', 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'RESOLVED' }) });
    expect(verifiedResolution.status).toBe(200);
  });

  it('rejects writes for a viewer and scopes finding detail', async () => {
    findings.item = { ...finding, access: { ...finding.access, writable: false } };
    const response = await fetch(`${baseUrl}/api/findings/finding-1`, { method: 'PATCH', headers: { Authorization: 'Bearer valid', 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'IGNORED' }) });
    expect(response.status).toBe(403);
    expect((await fetch(`${baseUrl}/api/findings/missing`, { headers: { Authorization: 'Bearer valid' } })).status).toBe(404);
  });

  it('serves generated assistance through authenticated API routes', async () => {
    const response = await fetch(`${baseUrl}/api/findings/finding-1/ai`, { method: 'POST', headers: { Authorization: 'Bearer valid' } });
    expect(response.status).toBe(200);
    expect((await response.json()).data.explanation).toBe('Add alt text.');
    const list = await fetch(`${baseUrl}/api/ai/fixes`, { headers: { Authorization: 'Bearer valid' } });
    expect(list.status).toBe(200);
    expect((await list.json()).data).toEqual([]);
  });
});
