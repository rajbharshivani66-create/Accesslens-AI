import { describe, expect, it, vi } from 'vitest';
import { decryptJiraToken, encryptJiraToken, JiraService, parseJiraSites } from '../modules/jira/jira.service.js';

const key = 'a'.repeat(64);

describe('Jira integration security helpers', () => {
  it('encrypts tokens with authenticated encryption and rejects tampering', () => {
    const encrypted = encryptJiraToken('refresh-secret', key);
    expect(encrypted).not.toContain('refresh-secret');
    expect(decryptJiraToken(encrypted, key)).toBe('refresh-secret');
    expect(() => decryptJiraToken(encrypted, 'b'.repeat(64))).toThrow();
    const tampered = encrypted.slice(0, -2) + '00';
    expect(() => decryptJiraToken(tampered, key)).toThrow();
  });

  it('accepts only Jira sites with required scopes and safe Atlassian URLs', () => {
    const sites = parseJiraSites([
      { id: 'cloud-1', name: 'Work Jira', url: 'https://work.atlassian.net', scopes: ['read:jira-work', 'write:jira-work'] },
      { id: 'cloud-2', name: 'Wrong host', url: 'https://evil.example', scopes: ['read:jira-work', 'write:jira-work'] },
      { id: 'cloud-3', name: 'Read only', url: 'https://read.atlassian.net', scopes: ['read:jira-work'] }
    ]);
    expect(sites.map((site) => site.id)).toEqual(['cloud-1']);
  });

  it('stores only a hash of OAuth state and requests consent with minimal Jira scopes', async () => {
    const create = vi.fn(async (_args: { data: { stateHash: string } }) => ({ id: 'state-row' }));
    const service = new JiraService({ jiraOAuthState: { deleteMany: async () => ({ count: 0 }), create } } as never, {
      clientId: 'client-id', clientSecret: 'client-secret', redirectUri: 'https://api.example/api/jira/callback', tokenEncryptionKey: key, frontendUrl: 'https://app.example'
    });
    const result = await service.start('profile-1');
    const authorization = new URL(result.authorizationUrl);
    expect(authorization.origin).toBe('https://auth.atlassian.com');
    expect(authorization.searchParams.get('prompt')).toBe('consent');
    expect(authorization.searchParams.get('response_type')).toBe('code');
    expect(authorization.searchParams.get('scope')).toBe('read:jira-work write:jira-work offline_access');
    const stored = create.mock.calls[0]?.[0];
    expect(stored.data.stateHash).not.toBe(authorization.searchParams.get('state'));
    expect(stored.data.stateHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('exchanges callback codes, fetches allowed sites, and stores only encrypted tokens', async () => {
    let stateRow: Record<string, unknown> = {};
    const stateStore = {
      deleteMany: vi.fn(async () => ({ count: 0 })),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { stateRow = { id: 'state-row', ...data }; return stateRow; }),
      updateMany: vi.fn(async () => ({ count: 1 })),
      findUnique: vi.fn(async () => stateRow),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { stateRow = { ...stateRow, ...data }; return stateRow; }),
      findFirst: vi.fn(async () => stateRow)
    };
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      if (String(url) === 'https://auth.atlassian.com/oauth/token') return new Response(JSON.stringify({ access_token: 'access-secret', refresh_token: 'refresh-secret', expires_in: 3600 }), { status: 200 });
      return new Response(JSON.stringify([{ id: 'cloud-1', name: 'Workspace', url: 'https://workspace.atlassian.net', scopes: ['read:jira-work', 'write:jira-work'] }]), { status: 200 });
    });
    const service = new JiraService({ jiraOAuthState: stateStore } as never, {
      clientId: 'client-id', clientSecret: 'client-secret', redirectUri: 'https://api.example/api/jira/callback', tokenEncryptionKey: key, frontendUrl: 'https://app.example'
    }, fetchMock as typeof fetch);
    const { authorizationUrl } = await service.start('profile-1');
    const state = new URL(authorizationUrl).searchParams.get('state')!;
    const redirect = await service.callback({ state, code: 'one-time-code' });
    expect(new URL(redirect).searchParams.get('jira_state')).toBe(state);
    expect(stateRow).toMatchObject({ completedAt: expect.any(Date) });
    expect(stateRow.accessTokenCiphertext).not.toBe('access-secret');
    expect(decryptJiraToken(String(stateRow.accessTokenCiphertext), key)).toBe('access-secret');
    expect(decryptJiraToken(String(stateRow.refreshTokenCiphertext), key)).toBe('refresh-secret');
    expect(JSON.stringify(stateRow)).not.toContain('one-time-code');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('Jira issue lifecycle', () => {
  const config = { clientId: 'client-id', clientSecret: 'client-secret', redirectUri: 'https://api.example/api/jira/callback', tokenEncryptionKey: key, frontendUrl: 'https://app.example' };

  it('creates an issue only from authorized finding data, strips unsafe page URL parts, and records activity', async () => {
    const finding = {
      id: 'finding-1', title: 'Missing accessible name', ruleId: 'button-name', severity: 'SERIOUS', wcag: '4.1.2',
      pageUrl: 'https://site.example/path?token=secret#form', selector: 'button.save', description: 'Button has no name',
      scan: { project: { url: 'https://site.example', teamId: null } }, jiraIssue: null,
      aiExplanation: { summary: 'Controls need names', detail: 'Screen reader users cannot identify this control.' },
      fixSuggestion: { htmlSuggestion: '<button aria-label="Save">Save</button>', after: '' }
    };
    const prisma = {
      finding: { findFirst: vi.fn(async () => finding) },
      jiraIntegration: { findFirst: vi.fn(async () => ({ id: 'integration-1', userId: 'user-1', cloudId: 'cloud-1', baseUrl: 'https://site.atlassian.net', projectKey: 'ACC', connectedAt: new Date(), accessTokenCiphertext: encryptJiraToken('access', key), refreshTokenCiphertext: encryptJiraToken('refresh', key), accessTokenExpiresAt: null })), findUnique: vi.fn(async () => ({ accessTokenCiphertext: encryptJiraToken('access', key), refreshTokenCiphertext: encryptJiraToken('refresh', key) })) },
      jiraIssue: { findUnique: vi.fn(), create: vi.fn(async () => ({ id: 'issue-row' })), update: vi.fn(async () => ({ id: 'issue-row', jiraKey: 'ACC-17', title: finding.title, status: 'CREATED', url: 'https://site.atlassian.net/browse/ACC-17', findingId: 'finding-1', lastSyncedAt: null })), deleteMany: vi.fn() },
      activityLog: { create: vi.fn(async () => ({})) }, notification: { create: vi.fn(async () => ({})) }, $transaction: vi.fn(async () => [])
    };
    let posted = '';
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => { posted = String(init?.body); return new Response(JSON.stringify({ key: 'ACC-17' }), { status: 201 }); });
    const service = new JiraService(prisma as never, config, fetchMock as typeof fetch);
    const result = await service.createIssue('user-1', 'finding-1', 'integration-1', true);
    const input = JSON.parse(posted) as { fields: { description: { content: Array<{ content: Array<{ text: string }> }> } } };
    const text = input.fields.description.content.map((line) => line.content[0]?.text).join('\n');
    expect(result).toMatchObject({ jiraKey: 'ACC-17', status: 'CREATED' });
    expect(prisma.finding.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: 'finding-1', scan: expect.any(Object) }) }));
    expect(text).toContain('https://site.example/path');
    expect(text).not.toContain('token=secret');
    expect(text).toContain('WCAG criterion: 4.1.2');
    expect(text).toContain('Developer-reviewed remediation suggestion:');
    expect(prisma.activityLog.create).toHaveBeenCalled();
    expect(prisma.notification.create).toHaveBeenCalled();
  });

  it('prevents duplicate issue creation for an already-linked finding', async () => {
    const existing = { id: 'issue-old', jiraKey: 'ACC-1', status: 'Open', findingId: 'finding-1' };
    const prisma = { finding: { findFirst: vi.fn(async () => ({ jiraIssue: existing })) }, jiraIntegration: { findFirst: vi.fn() }, jiraIssue: { create: vi.fn() } };
    const fetchMock = vi.fn();
    const result = await new JiraService(prisma as never, config, fetchMock as typeof fetch).createIssue('user-1', 'finding-1');
    expect(result).toEqual({ ...existing, alreadyExists: true });
    expect(prisma.jiraIssue.create).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('scopes issue details and disconnect operations to the requesting user', async () => {
    const findFirst = vi.fn(async () => null);
    const updateMany = vi.fn(async () => ({ count: 0 }));
    const service = new JiraService({ jiraIssue: { findFirst }, jiraIntegration: { updateMany } } as never, config);
    expect(await service.getIssue('user-a', 'issue-1')).toBeNull();
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'issue-1', integration: { userId: 'user-a' } } }));
    expect(await service.disconnect('user-a', 'integration-1')).toBe(false);
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'integration-1', userId: 'user-a' } }));
  });

  it('synchronizes status and marks inaccessible/deleted Jira issues without aborting the batch', async () => {
    const update = vi.fn(async ({ data }: { data: { status: string; lastSyncedAt: Date } }) => data);
    const integration = {
      id: 'integration-1', cloudId: 'cloud-1', accessTokenCiphertext: encryptJiraToken('access', key), refreshTokenCiphertext: encryptJiraToken('refresh', key), accessTokenExpiresAt: null,
      issues: [{ id: 'i1', jiraKey: 'ACC-1', status: 'Open' }, { id: 'i2', jiraKey: 'ACC-2', status: 'Open' }, { id: 'i3', jiraKey: 'ACC-3', status: 'Open' }]
    };
    const prisma = { jiraIntegration: { findFirst: vi.fn(async () => integration) }, jiraIssue: { update }, activityLog: { create: vi.fn(async () => ({})) } };
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const value = String(url);
      if (value.includes('/ACC-1?')) return new Response(JSON.stringify({ fields: { status: { name: 'In Progress' } } }), { status: 200 });
      if (value.includes('/ACC-2?')) return new Response('', { status: 404 });
      return new Response('', { status: 403 });
    });
    const result = await new JiraService(prisma as never, config, fetchMock as typeof fetch).syncIssues('user-1', 'integration-1');
    expect(result).toEqual({ synced: 1, unavailable: 2 });
    expect(update.mock.calls.map((call) => call[0].data.status)).toEqual(['In Progress', 'DELETED', 'INACCESSIBLE']);
    expect(update.mock.calls.every((call) => call[0].data.lastSyncedAt instanceof Date)).toBe(true);
    expect(prisma.activityLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'jira.issues_synchronized' }) }));
  });

  it('preserves a connection on temporary refresh failure and clears it only on invalid_grant', async () => {
    const integration = { id: 'integration-1', cloudId: 'cloud-1', accessTokenCiphertext: encryptJiraToken('expired', key), refreshTokenCiphertext: encryptJiraToken('refresh', key), accessTokenExpiresAt: new Date(Date.now() - 1000), issues: [] };
    const update = vi.fn(async () => ({}));
    const prisma = { jiraIntegration: { findFirst: vi.fn(async () => integration), update } , activityLog: { create: vi.fn(async () => ({})) } };
    const transient = new JiraService(prisma as never, config, (async () => new Response('{}', { status: 503 })) as typeof fetch);
    await expect(transient.syncIssues('user-1', 'integration-1')).rejects.toThrow('JIRA_PROVIDER_REQUEST_FAILED');
    expect(update).not.toHaveBeenCalled();

    const invalidGrant = new JiraService(prisma as never, config, (async () => new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 })) as typeof fetch);
    await expect(invalidGrant.syncIssues('user-1', 'integration-1')).rejects.toThrow('JIRA_REAUTH_REQUIRED');
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'integration-1' }, data: expect.objectContaining({ connectedAt: null, refreshTokenCiphertext: null }) }));
  });
});
