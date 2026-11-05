import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import type { AuthIdentity } from '../modules/auth/auth.types.js';
import type {
  DashboardRange,
  DashboardRepository,
  DashboardSummary
} from '../modules/dashboard/dashboard.repository.js';
import type {
  ProfileInput,
  ProfileRecord,
  ProjectInput,
  ProjectRecord,
  ProjectRepository
} from '../modules/projects/project.repository.js';

class InMemoryProjectRepository implements ProjectRepository {
  readonly profiles = new Map<string, ProfileRecord>();
  readonly projects = new Map<string, ProjectRecord>();

  async ping(): Promise<void> {}

  async ensureProfile(identity: AuthIdentity): Promise<ProfileRecord> {
    const existing = this.profiles.get(identity.id);
    if (existing) return existing;

    const now = new Date();
    const profile: ProfileRecord = {
      id: `profile-${identity.id}`,
      authUserId: identity.id,
      email: identity.email,
      fullName: null,
      avatarUrl: null,
      role: 'MEMBER',
      createdAt: now,
      updatedAt: now
    };
    this.profiles.set(identity.id, profile);
    return profile;
  }

  async getProfile(authUserId: string): Promise<ProfileRecord | null> {
    return this.profiles.get(authUserId) ?? null;
  }

  async updateProfile(
    authUserId: string,
    input: ProfileInput
  ): Promise<ProfileRecord | null> {
    const profile = this.profiles.get(authUserId);
    if (!profile) return null;

    const updated = { ...profile, ...input, updatedAt: new Date() };
    this.profiles.set(authUserId, updated);
    return updated;
  }

  async listProjects(ownerId: string, skip: number, take: number) {
    const owned = Array.from(this.projects.values())
      .filter((project) => project.ownerId === ownerId)
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());

    return { items: owned.slice(skip, skip + take), total: owned.length };
  }

  async getProject(ownerId: string, projectId: string): Promise<ProjectRecord | null> {
    const project = this.projects.get(projectId);
    return project?.ownerId === ownerId ? project : null;
  }

  async createProject(ownerId: string, input: ProjectInput): Promise<ProjectRecord> {
    const now = new Date();
    const project: ProjectRecord = {
      id: `project-${this.projects.size + 1}`,
      ownerId,
      teamId: null,
      name: input.name,
      url: input.url,
      description: input.description ?? null,
      createdAt: now,
      updatedAt: now
    };
    this.projects.set(project.id, project);
    return project;
  }

  async updateProject(
    ownerId: string,
    projectId: string,
    input: Partial<ProjectInput>
  ): Promise<ProjectRecord | null> {
    const project = await this.getProject(ownerId, projectId);
    if (!project) return null;

    const updated = { ...project, ...input, updatedAt: new Date() };
    this.projects.set(projectId, updated);
    return updated;
  }

  async deleteProject(ownerId: string, projectId: string): Promise<boolean> {
    const project = await this.getProject(ownerId, projectId);
    if (!project) return false;
    return this.projects.delete(projectId);
  }
}

class InMemoryDashboardRepository implements DashboardRepository {
  lastRequest: { ownerId: string; range: DashboardRange; startDate: Date } | null = null;

  async getSummary(
    ownerId: string,
    range: DashboardRange,
    startDate: Date
  ): Promise<DashboardSummary> {
    this.lastRequest = { ownerId, range, startDate };
    return {
      range,
      metrics: {
        projectCount: 2,
        scans: {
          total: 0,
          byStatus: { QUEUED: 0, IN_PROGRESS: 0, COMPLETED: 0, FAILED: 0 }
        },
        findings: {
          total: 0,
          byStatus: { OPEN: 0, IN_REVIEW: 0, RESOLVED: 0 },
          bySeverity: { CRITICAL: 0, SERIOUS: 0, MODERATE: 0, MINOR: 0 }
        },
        accessibilityScore: null,
        scoredProjectCount: 0
      },
      trends: [],
      recentScans: [],
      projectPerformance: [],
      recentActivity: []
    };
  }
}

describe('authenticated profile and project API', () => {
  let repository: InMemoryProjectRepository;
  let dashboardRepository: InMemoryDashboardRepository;
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    repository = new InMemoryProjectRepository();
    dashboardRepository = new InMemoryDashboardRepository();
    const app = createApp({
      repository,
      dashboardRepository,
      verifyAccessToken: async (token) => {
        if (token !== 'valid-user-one' && token !== 'valid-user-two') return null;
        const suffix = token === 'valid-user-one' ? 'one' : 'two';
        return { id: `auth-${suffix}`, email: `${suffix}@example.test` };
      }
    });

    server = app.listen(0);
    await once(server, 'listening');
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    server.close();
    await once(server, 'close');
  });

  it('reports database readiness through the health endpoint', async () => {
    const response = await fetch(`${baseUrl}/health`);
    const result = (await response.json()) as { data: { status: string; database: string } };

    expect(response.status).toBe(200);
    expect(result.data).toEqual({ status: 'ok', database: 'connected' });
  });

  it('rejects missing and invalid access tokens', async () => {
    const missing = await fetch(`${baseUrl}/api/projects`);
    const missingDashboard = await fetch(`${baseUrl}/api/dashboard/summary`);
    const invalid = await fetch(`${baseUrl}/api/projects`, {
      headers: { Authorization: 'Bearer invalid-token' }
    });

    expect(missing.status).toBe(401);
    expect(missingDashboard.status).toBe(401);
    expect(invalid.status).toBe(401);
  });

  it('returns a dashboard summary scoped to the verified profile', async () => {
    const response = await fetch(`${baseUrl}/api/dashboard/summary?range=7d`, {
      headers: { Authorization: 'Bearer valid-user-one' }
    });
    const result = (await response.json()) as { data: DashboardSummary };

    expect(response.status).toBe(200);
    expect(result.data.range).toBe('7d');
    expect(result.data.metrics.projectCount).toBe(2);
    expect(result.data.metrics.accessibilityScore).toBeNull();
    expect(dashboardRepository.lastRequest?.ownerId).toBe('profile-auth-one');
    expect(dashboardRepository.lastRequest?.range).toBe('7d');
    expect(dashboardRepository.lastRequest?.startDate.getUTCHours()).toBe(0);
  });

  it('defaults the dashboard range and rejects unsupported ranges', async () => {
    const defaultResponse = await fetch(`${baseUrl}/api/dashboard/summary`, {
      headers: { Authorization: 'Bearer valid-user-two' }
    });
    const invalidResponse = await fetch(`${baseUrl}/api/dashboard/summary?range=365d`, {
      headers: { Authorization: 'Bearer valid-user-two' }
    });
    const result = (await defaultResponse.json()) as { data: DashboardSummary };

    expect(defaultResponse.status).toBe(200);
    expect(result.data.range).toBe('30d');
    expect(dashboardRepository.lastRequest?.ownerId).toBe('profile-auth-two');
    expect(invalidResponse.status).toBe(400);
  });

  it('creates profiles from verified identities and scopes project lists to that profile', async () => {
    const createResponse = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid-user-one',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Owner project',
        url: 'https://owner.example.test',
        description: 'Private website'
      })
    });
    const created = (await createResponse.json()) as { data: ProjectRecord };
    const listResponse = await fetch(`${baseUrl}/api/projects?page=1&pageSize=10`, {
      headers: { Authorization: 'Bearer valid-user-two' }
    });
    const list = (await listResponse.json()) as {
      data: { items: ProjectRecord[]; pagination: { total: number } };
    };

    expect(createResponse.status).toBe(201);
    expect(created.data.ownerId).toBe('profile-auth-one');
    expect(repository.profiles.size).toBe(2);
    expect(list.data.items).toHaveLength(0);
    expect(list.data.pagination.total).toBe(0);
  });

  it('creates and updates the signed-in profile and supports owner project CRUD', async () => {
    const headers = {
      Authorization: 'Bearer valid-user-one',
      'Content-Type': 'application/json'
    };
    const identityResponse = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: headers.Authorization }
    });
    const profileResponse = await fetch(`${baseUrl}/api/profile`, {
      headers: { Authorization: headers.Authorization }
    });
    const profileUpdateResponse = await fetch(`${baseUrl}/api/profile`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ fullName: 'Owner One' })
    });
    const createdResponse = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: 'Owner site', url: 'https://owner.example.test' })
    });
    const created = (await createdResponse.json()) as { data: ProjectRecord };
    const updatedResponse = await fetch(`${baseUrl}/api/projects/${created.data.id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ name: 'Updated owner site' })
    });
    const deletedResponse = await fetch(`${baseUrl}/api/projects/${created.data.id}`, {
      method: 'DELETE',
      headers: { Authorization: headers.Authorization }
    });

    expect(identityResponse.status).toBe(200);
    expect(profileResponse.status).toBe(200);
    expect(profileUpdateResponse.status).toBe(200);
    expect(repository.profiles.get('auth-one')?.fullName).toBe('Owner One');
    expect(createdResponse.status).toBe(201);
    expect(updatedResponse.status).toBe(200);
    expect(deletedResponse.status).toBe(204);
  });

  it('does not allow another user to read, update, or delete an owned project', async () => {
    const project = await repository.createProject('profile-auth-one', {
      name: 'Private project',
      url: 'https://private.example.test'
    });
    const headers = { Authorization: 'Bearer valid-user-two' };

    const readResponse = await fetch(`${baseUrl}/api/projects/${project.id}`, { headers });
    const updateResponse = await fetch(`${baseUrl}/api/projects/${project.id}`, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Changed by another user' })
    });
    const deleteResponse = await fetch(`${baseUrl}/api/projects/${project.id}`, {
      method: 'DELETE',
      headers
    });

    expect(readResponse.status).toBe(404);
    expect(updateResponse.status).toBe(404);
    expect(deleteResponse.status).toBe(404);
    expect(repository.projects.get(project.id)?.name).toBe('Private project');
  });

  it('rejects unsafe project URL schemes and validates update payloads', async () => {
    const unsafe = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid-user-one',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: 'Unsafe', url: 'javascript:alert(1)' })
    });
    const emptyUpdate = await fetch(`${baseUrl}/api/projects/project-1`, {
      method: 'PUT',
      headers: {
        Authorization: 'Bearer valid-user-one',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });

    expect(unsafe.status).toBe(400);
    expect(emptyUpdate.status).toBe(400);
  });
});
