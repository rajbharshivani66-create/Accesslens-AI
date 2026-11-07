import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { Prisma, TeamMemberRole, type PrismaClient } from '@accesslens-ai/database';

export interface JiraServiceConfig {
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  tokenEncryptionKey?: string;
  frontendUrl: string;
}

export interface JiraSite { id: string; name: string; url: string; scopes: string[] }
export interface JiraProject { id: string; key: string; name: string }

const writableRoles: TeamMemberRole[] = [TeamMemberRole.OWNER, TeamMemberRole.ADMIN, TeamMemberRole.DEVELOPER];
export const parseJiraSites = (value: unknown): JiraSite[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const site = item as Record<string, unknown>;
    if (typeof site.id !== 'string' || !/^[A-Za-z0-9-]{1,80}$/.test(site.id) || typeof site.name !== 'string' || typeof site.url !== 'string' || !Array.isArray(site.scopes)) return [];
    try {
      const url = new URL(site.url);
      if (url.protocol !== 'https:' || url.port || url.username || url.password || url.pathname !== '/' || url.search || url.hash || !/^[a-z0-9-]+\.atlassian\.net$/i.test(url.hostname)) return [];
      const scopes = site.scopes.filter((scope): scope is string => typeof scope === 'string');
      if (!scopes.includes('write:jira-work') || !scopes.includes('read:jira-work')) return [];
      return [{ id: site.id, name: site.name.slice(0, 200), url: url.origin, scopes }];
    } catch { return []; }
  });
};

export function encryptJiraToken(value: string, keyHex: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `v1.${iv.toString('hex')}.${cipher.getAuthTag().toString('hex')}.${encrypted.toString('hex')}`;
}

export function decryptJiraToken(value: string, keyHex: string): string {
  const [version, ivHex, tagHex, encryptedHex] = value.split('.');
  if (version !== 'v1' || !ivHex || !tagHex || !encryptedHex) throw new Error('JIRA_TOKEN_INVALID');
  try {
    const decipher = createDecipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(encryptedHex, 'hex')), decipher.final()]).toString('utf8');
  } catch { throw new Error('JIRA_TOKEN_INVALID'); }
}

function tokenString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= 16_000 ? value : null;
}

function cloudApi(cloudId: string, path: string): string {
  if (!/^[A-Za-z0-9-]{1,80}$/.test(cloudId) || !path.startsWith('/')) throw new Error('JIRA_SITE_INVALID');
  return `https://api.atlassian.com/ex/jira/${encodeURIComponent(cloudId)}${path}`;
}

function cleanIssueText(value: string, maximum: number): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maximum);
}

function safeFindingUrl(value: string | null, projectUrl: string): string | null {
  if (!value) return null;
  try {
    const page = new URL(value);
    const project = new URL(projectUrl);
    if (!['http:', 'https:'].includes(page.protocol) || page.username || page.password || page.origin !== project.origin) return null;
    return `${page.origin}${page.pathname}`;
  } catch { return null; }
}

export class JiraService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly config: JiraServiceConfig,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  private configured(): boolean {
    return Boolean(this.config.clientId && this.config.clientSecret && this.config.redirectUri && this.config.tokenEncryptionKey);
  }

  private key(): string {
    if (!this.config.tokenEncryptionKey || !/^[a-fA-F0-9]{64}$/.test(this.config.tokenEncryptionKey)) throw new Error('JIRA_NOT_CONFIGURED');
    return this.config.tokenEncryptionKey;
  }

  private redirect(error?: string, state?: string): string {
    const url = new URL('/jira', this.config.frontendUrl);
    if (error) url.searchParams.set('jira_error', error);
    if (state) url.searchParams.set('jira_state', state);
    return url.toString();
  }

  async start(userId: string): Promise<{ authorizationUrl: string }> {
    if (!this.configured()) throw new Error('JIRA_NOT_CONFIGURED');
    await this.prisma.jiraOAuthState.deleteMany({ where: { userId, expiresAt: { lt: new Date() } } });
    const state = randomBytes(32).toString('base64url');
    const stateHash = createHash('sha256').update(state).digest('hex');
    await this.prisma.jiraOAuthState.create({ data: { userId, stateHash, expiresAt: new Date(Date.now() + 10 * 60_000) } });
    const url = new URL('https://auth.atlassian.com/authorize');
    url.searchParams.set('audience', 'api.atlassian.com');
    url.searchParams.set('client_id', this.config.clientId!);
    url.searchParams.set('scope', 'read:jira-work write:jira-work offline_access');
    url.searchParams.set('redirect_uri', this.config.redirectUri!);
    url.searchParams.set('state', state);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('prompt', 'consent');
    return { authorizationUrl: url.toString() };
  }

  async callback(query: { code?: unknown; state?: unknown; error?: unknown }): Promise<string> {
    const state = typeof query.state === 'string' && /^[A-Za-z0-9_-]{43}$/.test(query.state) ? query.state : null;
    if (!this.configured() || !state) return this.redirect('oauth_failed');
    const stateHash = createHash('sha256').update(state).digest('hex');
    const claimed = await this.prisma.jiraOAuthState.updateMany({
      where: { stateHash, callbackUsedAt: null, consumedAt: null, expiresAt: { gt: new Date() } },
      data: { callbackUsedAt: new Date() }
    });
    if (claimed.count !== 1) return this.redirect('state_invalid');
    const stateRow = await this.prisma.jiraOAuthState.findUnique({ where: { stateHash } });
    if (!stateRow) return this.redirect('state_invalid');
    if (typeof query.error === 'string' || typeof query.code !== 'string' || query.code.length > 4096) {
      await this.prisma.jiraOAuthState.update({ where: { id: stateRow.id }, data: { consumedAt: new Date() } });
      return this.redirect('authorization_denied');
    }
    try {
      const tokenResponse = await this.requestJson('https://auth.atlassian.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ grant_type: 'authorization_code', client_id: this.config.clientId, client_secret: this.config.clientSecret, code: query.code, redirect_uri: this.config.redirectUri })
      });
      const tokenObject = tokenResponse as Record<string, unknown>;
      const accessToken = tokenString(tokenObject.access_token);
      const refreshToken = tokenString(tokenObject.refresh_token);
      const expiresIn = typeof tokenObject.expires_in === 'number' ? tokenObject.expires_in : 0;
      if (!accessToken || !refreshToken || expiresIn <= 0) throw new Error('JIRA_TOKEN_INVALID');
      const resourcesResponse = await this.requestJson('https://api.atlassian.com/oauth/token/accessible-resources', { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } });
      const sites = parseJiraSites(resourcesResponse);
      if (!sites.length) throw new Error('JIRA_SITES_UNAVAILABLE');
      await this.prisma.jiraOAuthState.update({
        where: { id: stateRow.id },
        data: {
          accessTokenCiphertext: encryptJiraToken(accessToken, this.key()),
          refreshTokenCiphertext: encryptJiraToken(refreshToken, this.key()),
          accessTokenExpiresAt: new Date(Date.now() + expiresIn * 1000),
          sites: sites as unknown as Prisma.InputJsonValue,
          completedAt: new Date(),
          expiresAt: new Date(Date.now() + 10 * 60_000)
        }
      });
      return this.redirect(undefined, state);
    } catch (error) {
      await this.prisma.jiraOAuthState.update({ where: { id: stateRow.id }, data: { consumedAt: new Date() } });
      console.error('Jira OAuth callback failed.', { errorName: error instanceof Error ? error.name : 'UnknownError' });
      return this.redirect(error instanceof Error && error.message === 'JIRA_SITES_UNAVAILABLE' ? 'no_accessible_sites' : 'oauth_failed');
    }
  }

  private async requestJson(url: string, init: RequestInit = {}): Promise<Record<string, unknown> | unknown[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await this.fetchImpl(url, { ...init, signal: controller.signal });
      const text = await response.text();
      if (text.length > 128_000) throw new Error('JIRA_PROVIDER_REQUEST_FAILED');
      const result: unknown = JSON.parse(text);
      if (!result || typeof result !== 'object') throw new Error('JIRA_PROVIDER_REQUEST_FAILED');
      if (!response.ok) {
        if (url === 'https://auth.atlassian.com/oauth/token' && response.status === 400 && (result as Record<string, unknown>).error === 'invalid_grant') throw new Error('JIRA_REFRESH_REJECTED');
        throw new Error('JIRA_PROVIDER_REQUEST_FAILED');
      }
      return result as Record<string, unknown> | unknown[];
    } catch (error) {
      if (error instanceof Error && error.message === 'JIRA_REFRESH_REJECTED') throw error;
      throw new Error('JIRA_PROVIDER_REQUEST_FAILED');
    } finally { clearTimeout(timeout); }
  }

  private async pendingState(userId: string, state: string) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(state)) return null;
    const row = await this.prisma.jiraOAuthState.findFirst({
      where: { userId, stateHash: createHash('sha256').update(state).digest('hex'), completedAt: { not: null }, consumedAt: null, expiresAt: { gt: new Date() } }
    });
    return row;
  }

  async pending(userId: string, state: string) {
    const row = await this.pendingState(userId, state);
    if (!row) return null;
    return { sites: parseJiraSites(row.sites), expiresAt: row.expiresAt };
  }

  private async pendingTokens(userId: string, state: string, cloudId: string) {
    const row = await this.pendingState(userId, state);
    if (!row || !row.accessTokenCiphertext || !row.refreshTokenCiphertext) return null;
    const site = parseJiraSites(row.sites).find((candidate) => candidate.id === cloudId);
    if (!site) return null;
    return { row, site, accessToken: decryptJiraToken(row.accessTokenCiphertext, this.key()) };
  }

  async projects(userId: string, state: string, cloudId: string): Promise<JiraProject[] | null> {
    const pending = await this.pendingTokens(userId, state, cloudId);
    if (!pending) return null;
    const response = await this.requestJson(cloudApi(cloudId, '/rest/api/3/project/search?maxResults=100'), {
      headers: { Authorization: `Bearer ${pending.accessToken}`, Accept: 'application/json' }
    });
    const values = Array.isArray(response) ? response : Array.isArray((response as Record<string, unknown>).values) ? (response as Record<string, unknown>).values as unknown[] : [];
    return values.flatMap((value) => {
      if (!value || typeof value !== 'object') return [];
      const project = value as Record<string, unknown>;
      if (typeof project.id !== 'string' || typeof project.key !== 'string' || typeof project.name !== 'string' || !/^[A-Z][A-Z0-9_]{0,19}$/.test(project.key)) return [];
      return [{ id: project.id, key: project.key, name: project.name.slice(0, 200) }];
    });
  }

  async complete(userId: string, state: string, cloudId: string, projectKey: string) {
    const pending = await this.pendingTokens(userId, state, cloudId);
    if (!pending || !/^[A-Z][A-Z0-9_]{0,19}$/.test(projectKey)) return null;
    const projectResult = await this.requestJson(cloudApi(cloudId, `/rest/api/3/project/${encodeURIComponent(projectKey)}`), {
      headers: { Authorization: `Bearer ${pending.accessToken}`, Accept: 'application/json' }
    });
    if (typeof (projectResult as Record<string, unknown>).key !== 'string' || (projectResult as Record<string, unknown>).key !== projectKey) return null;
    const access = pending.row.accessTokenCiphertext!;
    const refresh = pending.row.refreshTokenCiphertext!;
    const integration = await this.prisma.jiraIntegration.upsert({
      where: { userId_cloudId: { userId, cloudId } },
      create: {
        userId, cloudId, baseUrl: pending.site.url, projectKey,
        accessTokenCiphertext: access,
        refreshTokenCiphertext: refresh,
        accessTokenExpiresAt: pending.row.accessTokenExpiresAt,
        scopes: pending.site.scopes,
        connectedAt: new Date()
      },
      update: {
        baseUrl: pending.site.url, projectKey, accessTokenCiphertext: access,
        refreshTokenCiphertext: refresh, accessTokenExpiresAt: pending.row.accessTokenExpiresAt,
        scopes: pending.site.scopes, connectedAt: new Date()
      },
      select: { id: true, cloudId: true, baseUrl: true, projectKey: true, connectedAt: true }
    });
    await this.prisma.jiraOAuthState.update({ where: { id: pending.row.id }, data: { consumedAt: new Date(), accessTokenCiphertext: null, refreshTokenCiphertext: null, sites: Prisma.DbNull } });
    return integration;
  }

  async integration(userId: string) {
    return this.prisma.jiraIntegration.findMany({
      where: { userId },
      select: {
        id: true, cloudId: true, baseUrl: true, projectKey: true, connectedAt: true, scopes: true,
        issues: { orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, jiraKey: true, title: true, status: true, url: true, findingId: true, createdAt: true, lastSyncedAt: true } }
      },
      orderBy: { updatedAt: 'desc' }
    });
  }

  async status(userId: string) {
    const integrations = await this.integration(userId);
    return { configured: this.configured(), connected: integrations.some((item) => Boolean(item.connectedAt)), integrations };
  }

  async getIssue(userId: string, issueId: string) {
    return this.prisma.jiraIssue.findFirst({
      where: { id: issueId, integration: { userId } },
      select: { id: true, jiraKey: true, title: true, status: true, url: true, findingId: true, createdAt: true, updatedAt: true, lastSyncedAt: true }
    });
  }

  async disconnect(userId: string, integrationId: string): Promise<boolean> {
    const result = await this.prisma.jiraIntegration.updateMany({
      where: { id: integrationId, userId },
      data: { accessTokenCiphertext: null, refreshTokenCiphertext: null, accessTokenExpiresAt: null, connectedAt: null }
    });
    return result.count === 1;
  }

  async syncIssues(userId: string, integrationId: string): Promise<{ synced: number; unavailable: number } | null> {
    const integration = await this.prisma.jiraIntegration.findFirst({
      where: { id: integrationId, userId, cloudId: { not: null }, connectedAt: { not: null } },
      include: { issues: { orderBy: { updatedAt: 'asc' }, take: 50 } }
    });
    if (!integration?.cloudId || !integration.accessTokenCiphertext) return null;
    let accessToken = decryptJiraToken(integration.accessTokenCiphertext, this.key());
    if (integration.accessTokenExpiresAt && integration.accessTokenExpiresAt.getTime() <= Date.now() + 60_000) {
      accessToken = await this.refresh({ id: integration.id, refreshTokenCiphertext: integration.refreshTokenCiphertext });
    }
    let synced = 0;
    let unavailable = 0;
    for (const issue of integration.issues) {
      if (issue.status === 'CREATING' || issue.jiraKey.startsWith('PENDING-')) continue;
      let response = await this.issueRequest(cloudApi(integration.cloudId, `/rest/api/3/issue/${encodeURIComponent(issue.jiraKey)}?fields=status`), {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' }
      });
      if (response.status === 401) {
        accessToken = await this.refresh({ id: integration.id, refreshTokenCiphertext: integration.refreshTokenCiphertext });
        response = await this.issueRequest(cloudApi(integration.cloudId, `/rest/api/3/issue/${encodeURIComponent(issue.jiraKey)}?fields=status`), {
          headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' }
        });
      }
      if (response.status === 404 || response.status === 403) {
        await this.prisma.jiraIssue.update({ where: { id: issue.id }, data: { status: response.status === 404 ? 'DELETED' : 'INACCESSIBLE', lastSyncedAt: new Date() } });
        unavailable += 1;
        continue;
      }
      if (!response.ok) throw new Error('JIRA_SYNC_FAILED');
      let body: { fields?: { status?: { name?: unknown } } };
      try { body = JSON.parse(response.text) as typeof body; }
      catch { throw new Error('JIRA_SYNC_FAILED'); }
      const status = body.fields?.status?.name;
      if (typeof status !== 'string' || !status.trim() || status.length > 100) throw new Error('JIRA_SYNC_FAILED');
      await this.prisma.jiraIssue.update({ where: { id: issue.id }, data: { status: cleanIssueText(status, 100), lastSyncedAt: new Date() } });
      synced += 1;
    }
    await this.prisma.activityLog.create({ data: { userId, action: 'jira.issues_synchronized', entityType: 'JiraIntegration', entityId: integration.id, details: { synced, unavailable } } });
    return { synced, unavailable };
  }

  private async refresh(integration: { id: string; refreshTokenCiphertext: string | null }) {
    if (!integration.refreshTokenCiphertext || !this.configured()) throw new Error('JIRA_REAUTH_REQUIRED');
    const refreshToken = decryptJiraToken(integration.refreshTokenCiphertext, this.key());
    let response: Record<string, unknown> | unknown[];
    try {
      response = await this.requestJson('https://auth.atlassian.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ grant_type: 'refresh_token', client_id: this.config.clientId, client_secret: this.config.clientSecret, refresh_token: refreshToken })
      });
    } catch (error) {
      if (!(error instanceof Error) || error.message !== 'JIRA_REFRESH_REJECTED') throw new Error('JIRA_PROVIDER_REQUEST_FAILED');
      await this.prisma.jiraIntegration.update({ where: { id: integration.id }, data: { accessTokenCiphertext: null, refreshTokenCiphertext: null, accessTokenExpiresAt: null, connectedAt: null } });
      throw new Error('JIRA_REAUTH_REQUIRED');
    }
    const tokenObject = response as Record<string, unknown>;
    const accessToken = tokenString(tokenObject.access_token);
    const newRefreshToken = tokenString(tokenObject.refresh_token);
    const expiresIn = typeof tokenObject.expires_in === 'number' ? tokenObject.expires_in : 0;
    if (!accessToken || !newRefreshToken || expiresIn <= 0) {
      throw new Error('JIRA_PROVIDER_REQUEST_FAILED');
    }
    const updated = await this.prisma.jiraIntegration.update({
      where: { id: integration.id },
      data: { accessTokenCiphertext: encryptJiraToken(accessToken, this.key()), refreshTokenCiphertext: encryptJiraToken(newRefreshToken, this.key()), accessTokenExpiresAt: new Date(Date.now() + expiresIn * 1000) },
      select: { accessTokenCiphertext: true }
    });
    return decryptJiraToken(updated.accessTokenCiphertext!, this.key());
  }

  private async issueRequest(url: string, init: RequestInit) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await this.fetchImpl(url, { ...init, signal: controller.signal });
      const text = await response.text();
      if (text.length > 64_000) throw new Error('JIRA_ISSUE_CREATE_FAILED');
      return { status: response.status, ok: response.ok, text };
    } catch {
      throw new Error('JIRA_ISSUE_CREATE_FAILED');
    } finally { clearTimeout(timeout); }
  }

  async createIssue(userId: string, findingId: string, integrationId?: string, includeReviewedRemediation = false) {
    const finding = await this.prisma.finding.findFirst({
      where: {
        id: findingId,
        scan: { project: { OR: [
          { ownerId: userId, teamId: null },
          { team: { members: { some: { userId, role: { in: writableRoles } } } } }
        ] } }
      },
      include: { scan: { include: { project: true } }, jiraIssue: true, aiExplanation: true, fixSuggestion: true }
    });
    if (!finding) return null;
    if (finding.jiraIssue) return { ...finding.jiraIssue, alreadyExists: true };
    const integration = await this.prisma.jiraIntegration.findFirst({
      where: { userId, ...(integrationId ? { id: integrationId } : {}), cloudId: { not: null }, connectedAt: { not: null }, accessTokenCiphertext: { not: null }, refreshTokenCiphertext: { not: null } },
      orderBy: { updatedAt: 'desc' }
    });
    if (!integration?.cloudId) throw new Error('JIRA_NOT_CONNECTED');
    if (integration.accessTokenExpiresAt && integration.accessTokenExpiresAt.getTime() <= Date.now() + 60_000) {
      await this.refresh(integration);
    }
    const current = await this.prisma.jiraIntegration.findUnique({ where: { id: integration.id } });
    if (!current?.accessTokenCiphertext) throw new Error('JIRA_REAUTH_REQUIRED');
    let accessToken = decryptJiraToken(current.accessTokenCiphertext, this.key());
    const pageUrl = safeFindingUrl(finding.pageUrl, finding.scan.project.url);
    const reviewedSuggestion = includeReviewedRemediation && finding.fixSuggestion
      ? cleanIssueText(finding.fixSuggestion.htmlSuggestion || finding.fixSuggestion.after, 4000)
      : '';
    const descriptionText = [
      `Accessibility finding: ${cleanIssueText(finding.title, 300)}`,
      `axe-core rule: ${cleanIssueText(finding.ruleId, 120)}`,
      `Severity: ${finding.severity}`,
      ...(finding.wcag ? [`WCAG criterion: ${cleanIssueText(finding.wcag, 120)}`] : []),
      ...(pageUrl ? [`Affected page: ${pageUrl}`] : []),
      'Reproduction: Open the affected page and inspect the reported axe-core rule and target selector.',
      ...(finding.selector ? [`Target selector: ${cleanIssueText(finding.selector, 500)}`] : []),
      ...(finding.description ? [`Finding details: ${cleanIssueText(finding.description, 2000)}`] : []),
      ...(finding.aiExplanation?.summary ? [`AI explanation: ${cleanIssueText(finding.aiExplanation.summary, 1000)}`] : []),
      ...(finding.aiExplanation?.detail ? [`User impact: ${cleanIssueText(finding.aiExplanation.detail, 2000)}`] : []),
      ...(reviewedSuggestion ? [`Developer-reviewed remediation suggestion:\n${reviewedSuggestion}`] : [])
    ].join('\n');
    const adf = { version: 1, type: 'doc', content: descriptionText.split('\n').map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })) };
    const reservationKey = `PENDING-${randomBytes(12).toString('hex').toUpperCase()}`;
    const reservation = await this.prisma.jiraIssue.create({
      data: { integrationId: integration.id, findingId, jiraKey: reservationKey, title: cleanIssueText(finding.title, 255), status: 'CREATING' },
      select: { id: true }
    });
    try {
      let response = await this.issueRequest(cloudApi(integration.cloudId, '/rest/api/3/issue'), {
        method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { project: { key: integration.projectKey }, summary: cleanIssueText(finding.title, 255), description: adf, issuetype: { name: 'Task' } } })
      });
      if (response.status === 401) {
        accessToken = await this.refresh({ id: integration.id, refreshTokenCiphertext: current.refreshTokenCiphertext });
        response = await this.issueRequest(cloudApi(integration.cloudId, '/rest/api/3/issue'), {
          method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields: { project: { key: integration.projectKey }, summary: cleanIssueText(finding.title, 255), description: adf, issuetype: { name: 'Task' } } })
        });
      }
      if (!response.ok) throw new Error('JIRA_ISSUE_CREATE_FAILED');
      const body = JSON.parse(response.text) as { key?: unknown };
      if (typeof body.key !== 'string' || !/^[A-Z][A-Z0-9_]*-\d+$/.test(body.key)) throw new Error('JIRA_ISSUE_CREATE_FAILED');
      const url = new URL(`/browse/${encodeURIComponent(body.key)}`, integration.baseUrl).toString();
      const created = await this.prisma.jiraIssue.update({ where: { id: reservation.id }, data: { jiraKey: body.key, status: 'CREATED', url }, select: { id: true, jiraKey: true, title: true, status: true, url: true, findingId: true, createdAt: true, lastSyncedAt: true } });
      await this.prisma.$transaction([
        this.prisma.activityLog.create({ data: { userId, action: 'jira.issue_created', entityType: 'JiraIssue', entityId: created.id, details: { findingId, jiraKey: created.jiraKey, integrationId: integration.id, includedReviewedRemediation: Boolean(reviewedSuggestion) } } }),
        this.prisma.notification.create({ data: { userId, type: 'JIRA_ISSUE_CREATED', title: 'Jira issue created', body: `${created.jiraKey}: ${created.title}` } })
      ]);
      return created;
    } catch (error) {
      await this.prisma.jiraIssue.deleteMany({ where: { id: reservation.id } });
      if (error instanceof Error && ['JIRA_REAUTH_REQUIRED', 'JIRA_ISSUE_CREATE_FAILED'].includes(error.message)) throw error;
      throw new Error('JIRA_ISSUE_CREATE_FAILED');
    }
  }
}
