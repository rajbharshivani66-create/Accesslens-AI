import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DashboardRepository } from '../modules/dashboard/dashboard.repository.js';
import type { ProjectRepository } from '../modules/projects/project.repository.js';
import type { TeamRepository } from '../modules/teams/team.repository.js';
import type { AuthIdentity } from '../modules/auth/auth.types.js';
import { createApp } from '../app.js';
import { parseApiEnvironment } from '../config/environment.js';
import {
  createRateLimitMiddleware,
  createRateLimitRuntime,
  defaultRateLimitSettings,
  type RateLimitSettings,
  type RateLimitMiddlewareSet
} from '../middleware/rate-limit.js';

const servers: Server[] = [];

function startTestApi(
  overrides: Partial<RateLimitSettings> = {},
  teamRepository?: TeamRepository,
  trustedProxyCidrs: string[] = [],
  rateLimiters?: RateLimitMiddlewareSet
): Promise<{ baseUrl: string; invitationCreate: ReturnType<typeof vi.fn> }> {
  const invitationCreate = vi.fn(async (_userId: string, _teamId: string, input: {
    email: string;
    role: 'ADMIN' | 'DEVELOPER' | 'VIEWER';
  }) => ({
    id: 'invitation-1',
    email: input.email,
    role: input.role,
    emailStatus: 'NOT_CONFIGURED' as const,
    expiresAt: new Date(Date.now() + 60_000),
    createdAt: new Date()
  }));
  const app = createApp({
    repository: {
      ping: async () => undefined,
      ensureProfile: async (identity: AuthIdentity) => ({ id: `profile-${identity.id}` })
    } as unknown as ProjectRepository,
    dashboardRepository: {} as DashboardRepository,
    teamRepository: teamRepository ?? {
      createInvitation: invitationCreate
    } as unknown as TeamRepository,
    verifyAccessToken: async (token) => token.startsWith('valid-')
      ? { id: token, email: `${token}@example.test`, emailVerified: true }
      : null,
    rateLimiters: rateLimiters ?? createRateLimitMiddleware({
      ...defaultRateLimitSettings,
      RATE_LIMIT_API_WINDOW_MS: 100,
      RATE_LIMIT_API_MAX: 100,
      RATE_LIMIT_AUTH_WINDOW_MS: 100,
      RATE_LIMIT_AUTH_MAX: 10,
      RATE_LIMIT_USER_WINDOW_MS: 100,
      RATE_LIMIT_USER_MAX: 100,
      RATE_LIMIT_WRITE_WINDOW_MS: 100,
      RATE_LIMIT_WRITE_MAX: 100,
      RATE_LIMIT_INVITATION_WINDOW_MS: 100,
      RATE_LIMIT_INVITATION_MAX: 1,
      ...overrides
    }),
    trustedProxyCidrs
  });
  const server = app.listen(0);
  servers.push(server);
  return new Promise((resolve) => {
    server.once('listening', () => {
      const address = server.address() as AddressInfo;
      resolve({ baseUrl: `http://127.0.0.1:${address.port}`, invitationCreate });
    });
  });
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  })));
});

describe('API rate limiting', () => {
  it('returns a consistent 429 response and allows requests again after reset', async () => {
    const { baseUrl } = await startTestApi({ RATE_LIMIT_AUTH_MAX: 2 });
    const request = () => fetch(`${baseUrl}/api/auth/me`, {
      headers: { authorization: 'Bearer valid-account' }
    });

    expect((await request()).status).toBe(200);
    expect((await request()).status).toBe(200);
    const limited = await request();
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many requests. Please try again later.'
      }
    });
    expect(limited.headers.get('ratelimit')).toBeTruthy();
    expect(limited.headers.get('retry-after')).toBeTruthy();

    await new Promise((resolve) => setTimeout(resolve, 150));
    expect((await request()).status).toBe(200);
  });

  it('ignores arbitrary X-Forwarded-For values when no trusted proxy is configured', async () => {
    const { baseUrl } = await startTestApi({ RATE_LIMIT_API_MAX: 2 });
    const request = (ip: string) => fetch(`${baseUrl}/api/projects`, {
      headers: { 'x-forwarded-for': ip }
    });

    expect((await request('198.51.100.10')).status).toBe(401);
    expect((await request('198.51.100.11')).status).toBe(401);
    expect((await request('198.51.100.12')).status).toBe(429);
  });

  it('enforces invitation limits by authenticated account', async () => {
    const { baseUrl, invitationCreate } = await startTestApi();
    const request = () => fetch(`${baseUrl}/api/teams/team-1/invitations`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-owner',
        'content-type': 'application/json'
      },
      body: JSON.stringify({ email: 'invitee@example.test' })
    });

    expect((await request()).status).toBe(201);
    const limited = await request();
    expect(limited.status).toBe(429);
    expect((await limited.json()).error.code).toBe('RATE_LIMITED');
    expect(invitationCreate).toHaveBeenCalledTimes(1);
  });

  it('enforces authenticated write-operation limits', async () => {
    const { baseUrl } = await startTestApi({ RATE_LIMIT_WRITE_MAX: 1 });
    const request = () => fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-account',
        'content-type': 'application/json'
      },
      body: JSON.stringify({})
    });

    expect((await request()).status).toBe(400);
    expect((await request()).status).toBe(429);
  });

  it('applies the stricter resource limit to reserved scan and AI route prefixes', async () => {
    const { baseUrl } = await startTestApi({ RATE_LIMIT_EXPENSIVE_MAX: 1 });
    const request = () => fetch(`${baseUrl}/api/ai/run`, {
      headers: { authorization: 'Bearer valid-account' }
    });

    expect((await request()).status).toBe(404);
    expect((await request()).status).toBe(429);
  });

  it('does not place health requests under the API quota', async () => {
    const { baseUrl } = await startTestApi({ RATE_LIMIT_API_MAX: 1 });
    expect((await fetch(`${baseUrl}/health`)).status).toBe(200);
    expect((await fetch(`${baseUrl}/health`)).status).toBe(200);
    expect((await fetch(`${baseUrl}/api/projects`)).status).toBe(401);
  });

  it('keeps CORS restricted and hides the Express signature header', async () => {
    const { baseUrl } = await startTestApi();
    const allowed = await fetch(`${baseUrl}/health`, {
      headers: { origin: 'http://localhost:3000' }
    });
    expect(allowed.headers.get('access-control-allow-origin')).toBe('http://localhost:3000');
    expect(allowed.headers.get('x-powered-by')).toBeNull();

    const denied = await fetch(`${baseUrl}/health`, {
      headers: { origin: 'https://untrusted.example.test' }
    });
    expect(denied.headers.get('access-control-allow-origin')).not.toBe(
      'https://untrusted.example.test'
    );
    expect(denied.headers.get('x-powered-by')).toBeNull();
  });

  it('adds security headers to API responses', async () => {
    const { baseUrl } = await startTestApi();
    const response = await fetch(`${baseUrl}/health`);

    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('x-frame-options')).toBe('SAMEORIGIN');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(response.headers.get('content-security-policy')).toContain("default-src 'self'");
    expect(response.headers.get('strict-transport-security')).toBeNull();
  });

  it('fails requests closed when the shared rate-limit store errors', async () => {
    const failedStore = createRateLimitMiddleware(
      defaultRateLimitSettings,
      async (command) => {
        if (command === 'SCRIPT') return 'test-script-sha';
        throw new Error('private Redis endpoint detail');
      }
    );
    const { baseUrl } = await startTestApi({}, undefined, [], failedStore);
    const response = await fetch(`${baseUrl}/api/projects`);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected server error occurred.' }
    });
  });

  it('fails API startup when the configured shared Redis store is unavailable', async () => {
    const environment = parseApiEnvironment({
      DATABASE_URL: 'postgresql://accesslens:example@localhost:5432/accesslens',
      DIRECT_URL: 'postgresql://accesslens:example@localhost:5432/accesslens',
      SUPABASE_URL: 'https://project.example.supabase.co',
      SUPABASE_ANON_KEY: 'test-anon-key',
      NODE_ENV: 'production',
      RATE_LIMIT_REDIS_URL: 'redis://127.0.0.1:1'
    });

    await expect(createRateLimitRuntime(environment)).rejects.toBeInstanceOf(Error);
  });
});
