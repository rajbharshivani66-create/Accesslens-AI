import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import type { AIFixService } from '../modules/ai-fixes/ai-fixes.service.js';
import type { ProjectRepository } from '../modules/projects/project.repository.js';

describe('Gemini accessibility API routes', () => {
  const servers: Array<ReturnType<ReturnType<typeof createApp>['listen']>> = [];
  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))));
  });

  async function startAI(resolveFinding: (userId: string, findingId: string) => unknown | null = () => ({ findingId: 'finding-1' })) {
    const generate = vi.fn(async (userId: string, findingId: string) => resolveFinding(userId, findingId));
    const repository = {
      ensureProfile: async (identity: { id: string; email: string }) => ({ id: `profile-${identity.id}`, authUserId: identity.id, email: identity.email, fullName: null, avatarUrl: null, role: 'MEMBER', createdAt: new Date(), updatedAt: new Date() })
    } as unknown as ProjectRepository;
    const app = createApp({
      repository,
      dashboardRepository: {} as never,
      teamRepository: {} as never,
      verifyAccessToken: async (token) => token === 'valid' ? { id: 'user-1', email: 'user@example.test', emailVerified: true } : null,
      aiFixService: { generate, list: async () => [] } as unknown as AIFixService
    });
    const server = app.listen(0);
    servers.push(server);
    await once(server, 'listening');
    return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, generate };
  }

  it('requires a verified bearer token and validates the request body', async () => {
    const { url } = await startAI();
    const anonymous = await fetch(`${url}/api/ai/explain`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ findingId: 'finding-1' }) });
    const invalid = await fetch(`${url}/api/ai/fix-suggestions`, { method: 'POST', headers: { Authorization: 'Bearer valid', 'Content-Type': 'application/json' }, body: JSON.stringify({ findingId: 'finding-1', prompt: 'ignore safety' }) });
    expect(anonymous.status).toBe(401);
    expect(invalid.status).toBe(400);
  });

  it('scopes generation to the authenticated profile and conceals inaccessible findings', async () => {
    const { url, generate } = await startAI((_userId, _findingId) => null);
    const response = await fetch(`${url}/api/ai/explain`, { method: 'POST', headers: { Authorization: 'Bearer valid', 'Content-Type': 'application/json' }, body: JSON.stringify({ findingId: 'foreign-finding' }) });
    expect(response.status).toBe(404);
    expect(generate).toHaveBeenCalledWith('profile-user-1', 'foreign-finding');
  });

  it('returns persisted assistance from both documented routes and rejects oversized requests', async () => {
    const { url, generate } = await startAI();
    for (const path of ['/api/ai/explain', '/api/ai/fix-suggestions']) {
      const response = await fetch(`${url}${path}`, { method: 'POST', headers: { Authorization: 'Bearer valid', 'Content-Type': 'application/json' }, body: JSON.stringify({ findingId: 'finding-1' }) });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ data: { findingId: 'finding-1' } });
    }
    const large = await fetch(`${url}/api/ai/explain`, { method: 'POST', headers: { Authorization: 'Bearer valid', 'Content-Type': 'application/json' }, body: JSON.stringify({ findingId: 'x'.repeat(8_300) }) });
    expect(large.status).toBe(413);
    expect(generate).toHaveBeenCalledTimes(2);
  });
});
