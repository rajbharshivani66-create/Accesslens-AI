import { once } from 'node:events';
import { createHash } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InvitationEmailStatus, TeamMemberRole } from '@accesslens-ai/database';
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
  ProjectRepository,
  ProjectUpdateInput
} from '../modules/projects/project.repository.js';
import type {
  TeamDetails,
  TeamInvitationInput,
  TeamInvitationSummary,
  TeamMemberSummary,
  TeamRepository,
  TeamSummary
} from '../modules/teams/team.repository.js';
import { ApiError } from '../utils/api-error.js';
import type { ActivityRepository } from '../modules/activity/activity.repository.js';
import type { AnalyticsRepository } from '../modules/analytics/analytics.repository.js';

class InMemoryActivityRepository implements ActivityRepository {
  lastUserId = '';
  async listNotifications(userId: string) { this.lastUserId = userId; return { items: [], total: 0, unread: 0 }; }
  async markNotificationRead(userId: string, id: string) { this.lastUserId = userId; return id === 'owned-notification'; }
  async markAllNotificationsRead(userId: string) { this.lastUserId = userId; return 2; }
  async listActivity(userId: string) { this.lastUserId = userId; return { items: [], total: 0 }; }
}
class InMemoryAnalyticsRepository implements AnalyticsRepository {
  lastRequest: { userId: string; range: string; projectId?: string } | null = null;
  async summarize(userId: string, range: '7d' | '30d' | '90d', projectId?: string) {
    this.lastRequest = { userId, range, ...(projectId ? { projectId } : {}) };
    if (projectId === 'foreign-project') return null;
    return { range, startDate: new Date('2025-01-01T00:00:00Z'), endDate: new Date('2025-01-07T00:00:00Z'), projectId: projectId ?? null, totals: { scans: 0, findings: 0 }, severity: [], wcag: [], trends: [], projects: [] };
  }
}

class InMemoryProjectRepository implements ProjectRepository {
  readonly profiles = new Map<string, ProfileRecord>();
  readonly projects = new Map<string, ProjectRecord>();
  readonly teamNames = new Map<string, string>();
  readonly memberships = new Map<string, Map<string, TeamMemberRole>>();

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

  async listProjects(userId: string, skip: number, take: number) {
    const owned = Array.from(this.projects.values())
      .filter((project) => this.canReadProject(userId, project))
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());

    return {
      items: owned.slice(skip, skip + take).map((project) => this.decorateProject(userId, project)),
      total: owned.length
    };
  }

  async getProject(userId: string, projectId: string): Promise<ProjectRecord | null> {
    const project = this.projects.get(projectId);
    return project && this.canReadProject(userId, project)
      ? this.decorateProject(userId, project)
      : null;
  }

  async createProject(userId: string, input: ProjectInput): Promise<ProjectRecord> {
    const teamId = input.teamId ?? null;
    if (teamId && !this.canEditTeam(userId, teamId)) {
      throw new ApiError(403, 'FORBIDDEN', 'Your team role does not allow creating projects.');
    }
    const now = new Date();
    const project: ProjectRecord = {
      id: `project-${this.projects.size + 1}`,
      ownerId: userId,
      teamId,
      name: input.name,
      url: input.url,
      description: input.description ?? null,
      team: teamId ? { id: teamId, name: this.teamNames.get(teamId) ?? '' } : null,
      accessRole: teamId
        ? this.memberships.get(teamId)?.get(userId) ?? null
        : 'OWNER',
      canEdit: !teamId || this.canEditTeam(userId, teamId),
      canDelete: !teamId || this.canDeleteTeamProject(userId, teamId),
      createdAt: now,
      updatedAt: now
    };
    this.projects.set(project.id, project);
    return project;
  }

  async updateProject(
    userId: string,
    projectId: string,
    input: ProjectUpdateInput
  ): Promise<ProjectRecord | null> {
    const project = await this.getProject(userId, projectId);
    if (!project || !project.canEdit) return null;

    const updated = { ...project, ...input, updatedAt: new Date() };
    this.projects.set(projectId, updated);
    return this.decorateProject(userId, updated);
  }

  async deleteProject(userId: string, projectId: string): Promise<boolean> {
    const project = await this.getProject(userId, projectId);
    if (!project || !project.canDelete) return false;
    return this.projects.delete(projectId);
  }

  canReadProject(userId: string, project: ProjectRecord): boolean {
    if (!project.teamId) return project.ownerId === userId;
    return this.memberships.get(project.teamId)?.has(userId) ?? false;
  }

  canEditTeam(userId: string, teamId: string): boolean {
    const role = this.memberships.get(teamId)?.get(userId);
    return role === 'OWNER' || role === 'ADMIN' || role === 'DEVELOPER';
  }

  canDeleteTeamProject(userId: string, teamId: string): boolean {
    const role = this.memberships.get(teamId)?.get(userId);
    return role === 'OWNER' || role === 'ADMIN';
  }

  private decorateProject(userId: string, project: ProjectRecord): ProjectRecord {
    const role = project.teamId ? this.memberships.get(project.teamId)?.get(userId) ?? null : null;
    const personalOwner = project.teamId === null && project.ownerId === userId;
    return {
      ...project,
      team: project.teamId
        ? { id: project.teamId, name: this.teamNames.get(project.teamId) ?? '' }
        : null,
      accessRole: role ?? (personalOwner ? 'OWNER' : null),
      canEdit: personalOwner || (project.teamId !== null && this.canEditTeam(userId, project.teamId)),
      canDelete:
        personalOwner ||
        (project.teamId !== null && this.canDeleteTeamProject(userId, project.teamId))
    };
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
          byStatus: { OPEN: 0, IN_REVIEW: 0, IGNORED: 0, RESOLVED: 0 },
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

interface MemoryTeam {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface MemoryInvitation extends TeamInvitationSummary {
  teamId: string;
  tokenHash: string;
  createdById: string;
  acceptedAt: Date | null;
  revokedAt: Date | null;
}

class InMemoryTeamRepository implements TeamRepository {
  readonly teams = new Map<string, MemoryTeam>();
  readonly invitations = new Map<string, MemoryInvitation>();
  private nextInvitationId = 1;
  private nextTeamId = 1;

  constructor(private readonly projects: InMemoryProjectRepository) {}

  private membership(userId: string, teamId: string): TeamMemberRole | undefined {
    return this.projects.memberships.get(teamId)?.get(userId);
  }

  private requireRole(
    userId: string,
    teamId: string,
    roles: TeamMemberRole[]
  ): TeamMemberRole {
    const role = this.membership(userId, teamId);
    if (!role) throw new ApiError(404, 'TEAM_NOT_FOUND', 'The team was not found.');
    if (!roles.includes(role)) throw new ApiError(403, 'FORBIDDEN', 'Insufficient team role.');
    return role;
  }

  private summary(userId: string, team: MemoryTeam): TeamSummary {
    const memberships = this.projects.memberships.get(team.id) ?? new Map();
    const role = memberships.get(userId);
    if (!role) throw new ApiError(404, 'TEAM_NOT_FOUND', 'The team was not found.');
    return {
      ...team,
      memberCount: memberships.size,
      myRole: role
    };
  }

  async listTeams(userId: string): Promise<TeamSummary[]> {
    return Array.from(this.teams.values())
      .filter((team) => this.membership(userId, team.id))
      .map((team) => this.summary(userId, team));
  }

  async getTeam(userId: string, teamId: string): Promise<TeamDetails | null> {
    const team = this.teams.get(teamId);
    const membership = this.projects.memberships.get(teamId);
    const role = membership?.get(userId);
    if (!team || !membership || !role) return null;
    const members: TeamMemberSummary[] = Array.from(membership.entries()).map(
      ([memberUserId, memberRole], index) => {
        const profile = this.projects.profiles.get(memberUserId);
        return {
          id: `${teamId}-member-${index + 1}`,
          userId: memberUserId,
          email: profile?.email ?? `${memberUserId}@example.test`,
          fullName: profile?.fullName ?? null,
          role: memberRole,
          joinedAt: team.createdAt
        };
      }
    );
    const invitations = Array.from(this.invitations.values())
      .filter((invite) =>
        invite.teamId === teamId &&
        invite.acceptedAt === null &&
        invite.revokedAt === null &&
        invite.expiresAt > new Date()
      )
      .map(({ id, email, role: inviteRole, expiresAt, createdAt }) => ({
        id,
        email,
        role: inviteRole,
        emailStatus: this.invitations.get(id)?.emailStatus ?? 'NOT_CONFIGURED',
        expiresAt,
        createdAt
      }));
    return {
      ...this.summary(userId, team),
      currentMemberId: `${teamId}-member-${Array.from(membership.keys()).indexOf(userId) + 1}`,
      members,
      invitations: role === 'OWNER' || role === 'ADMIN' ? invitations : []
    };
  }

  async createTeam(userId: string, name: string, description?: string): Promise<TeamDetails> {
    const now = new Date();
    const team: MemoryTeam = {
      id: `team-${this.nextTeamId++}`,
      name,
      description: description ?? null,
      createdAt: now,
      updatedAt: now
    };
    this.teams.set(team.id, team);
    this.projects.teamNames.set(team.id, team.name);
    this.projects.memberships.set(team.id, new Map([[userId, 'OWNER']]));
    const details = await this.getTeam(userId, team.id);
    if (!details) throw new Error('Memory team creation failed.');
    return details;
  }

  async updateTeam(
    userId: string,
    teamId: string,
    input: { name?: string; description?: string | null }
  ): Promise<TeamDetails | null> {
    this.requireRole(userId, teamId, ['OWNER', 'ADMIN']);
    const team = this.teams.get(teamId);
    if (!team) return null;
    Object.assign(team, input, { updatedAt: new Date() });
    if (input.name) this.projects.teamNames.set(teamId, input.name);
    return this.getTeam(userId, teamId);
  }

  async deleteTeam(userId: string, teamId: string): Promise<boolean> {
    this.requireRole(userId, teamId, ['OWNER']);
    const team = this.teams.get(teamId);
    if (!team) return false;
    const teamProjects = Array.from(this.projects.projects.values())
      .filter((project) => project.teamId === teamId);
    const projectNames = teamProjects.map((project) => project.name);
    const duplicateNames = new Set(projectNames).size !== projectNames.length;
    const conflictingProject = Array.from(this.projects.projects.values()).some(
      (project) =>
        project.ownerId === userId &&
        project.teamId !== teamId &&
        projectNames.includes(project.name)
    );
    if (duplicateNames || conflictingProject) {
      throw new ApiError(
        409,
        'PROJECT_NAME_CONFLICT',
        'Rename conflicting projects before deleting this team.'
      );
    }
    this.teams.delete(teamId);
    this.projects.teamNames.delete(teamId);
    this.projects.memberships.delete(teamId);
    for (const project of teamProjects) {
      Object.assign(project, {
        ownerId: userId,
        teamId: null,
        team: null,
        accessRole: 'OWNER',
        canEdit: true,
        canDelete: true
      });
    }
    return true;
  }

  async createInvitation(
    userId: string,
    teamId: string,
    input: TeamInvitationInput
  ): Promise<TeamInvitationSummary> {
    const actorRole = this.requireRole(userId, teamId, ['OWNER', 'ADMIN']);
    if (actorRole === 'ADMIN' && input.role === 'ADMIN') {
      throw new ApiError(403, 'FORBIDDEN', 'Only an owner can invite an administrator.');
    }
    const memberships = this.projects.memberships.get(teamId);
    const alreadyMember = Array.from(memberships?.keys() ?? []).some(
      (memberId) =>
        this.projects.profiles.get(memberId)?.email.toLowerCase() === input.email.toLowerCase()
    );
    if (alreadyMember) throw new ApiError(409, 'ALREADY_A_MEMBER', 'Already a team member.');
    const existing = Array.from(this.invitations.values()).find(
      (invite) =>
        invite.teamId === teamId &&
        invite.email.toLowerCase() === input.email.toLowerCase() &&
        !invite.acceptedAt &&
        !invite.revokedAt &&
        invite.expiresAt > new Date()
    );
    if (existing) throw new ApiError(409, 'INVITATION_EXISTS', 'An active invitation already exists.');
    const invitation: MemoryInvitation = {
      id: `invitation-${this.nextInvitationId++}`,
      teamId,
      email: input.email,
      role: input.role,
      emailStatus: input.emailStatus,
      tokenHash: input.tokenHash,
      createdById: userId,
      expiresAt: input.expiresAt,
      acceptedAt: null,
      revokedAt: null,
      createdAt: new Date()
    };
    this.invitations.set(invitation.id, invitation);
    const { id, email, role, emailStatus, expiresAt, createdAt } = invitation;
    return { id, email, role, emailStatus, expiresAt, createdAt };
  }

  async updateInvitationEmailStatus(
    invitationId: string,
    status: InvitationEmailStatus
  ): Promise<void> {
    const invitation = this.invitations.get(invitationId);
    if (!invitation) throw new Error('Memory invitation does not exist.');
    invitation.emailStatus = status;
  }

  async acceptInvitation(
    userId: string,
    email: string,
    tokenHash: string,
    acceptedAt: Date
  ): Promise<TeamSummary> {
    const invitation = Array.from(this.invitations.values()).find(
      (item) => item.tokenHash === tokenHash
    );
    if (
      !invitation ||
      invitation.acceptedAt ||
      invitation.revokedAt ||
      invitation.expiresAt <= acceptedAt
    ) {
      throw new ApiError(410, 'INVITATION_INVALID', 'The invitation is expired or no longer valid.');
    }
    if (invitation.email.toLowerCase() !== email.trim().toLowerCase()) {
      throw new ApiError(403, 'INVITATION_EMAIL_MISMATCH', 'The invitation email does not match.');
    }
    const memberships = this.projects.memberships.get(invitation.teamId);
    if (!memberships) throw new ApiError(410, 'INVITATION_INVALID', 'The team no longer exists.');
    if (memberships.has(userId)) throw new ApiError(409, 'ALREADY_A_MEMBER', 'Already a member.');
    invitation.acceptedAt = acceptedAt;
    memberships.set(userId, invitation.role);
    const team = this.teams.get(invitation.teamId);
    if (!team) throw new ApiError(410, 'INVITATION_INVALID', 'The team no longer exists.');
    return this.summary(userId, team);
  }

  async revokeInvitation(userId: string, teamId: string, invitationId: string): Promise<boolean> {
    this.requireRole(userId, teamId, ['OWNER', 'ADMIN']);
    const invitation = this.invitations.get(invitationId);
    if (
      !invitation ||
      invitation.teamId !== teamId ||
      invitation.acceptedAt ||
      invitation.revokedAt ||
      invitation.expiresAt <= new Date()
    ) return false;
    invitation.revokedAt = new Date();
    return true;
  }

  async updateMemberRole(
    userId: string,
    teamId: string,
    memberId: string,
    role: Exclude<TeamMemberRole, 'OWNER'>
  ): Promise<TeamDetails | null> {
    const actorRole = this.requireRole(userId, teamId, ['OWNER', 'ADMIN']);
    const details = await this.getTeam(userId, teamId);
    const target = details?.members.find((member) => member.id === memberId);
    if (!target) throw new ApiError(404, 'MEMBER_NOT_FOUND', 'Member not found.');
    if (target.role === 'OWNER') throw new ApiError(403, 'OWNER_PROTECTED', 'Owner role is protected.');
    if (actorRole === 'ADMIN' && (target.role === 'ADMIN' || role === 'ADMIN')) {
      throw new ApiError(403, 'FORBIDDEN', 'Administrators cannot manage administrator roles.');
    }
    this.projects.memberships.get(teamId)?.set(target.userId, role);
    return this.getTeam(userId, teamId);
  }

  async removeMember(userId: string, teamId: string, memberId: string): Promise<boolean> {
    const role = this.membership(userId, teamId);
    if (!role) throw new ApiError(404, 'TEAM_NOT_FOUND', 'The team was not found.');
    const details = await this.getTeam(userId, teamId);
    const target = details?.members.find((member) => member.id === memberId);
    if (!target) return false;
    if (target.role === 'OWNER') throw new ApiError(403, 'OWNER_PROTECTED', 'Owner is protected.');
    if (target.userId !== userId && role !== 'OWNER' && role !== 'ADMIN') {
      throw new ApiError(403, 'FORBIDDEN', 'Insufficient role.');
    }
    if (target.userId !== userId && role === 'ADMIN' && target.role === 'ADMIN') {
      throw new ApiError(403, 'FORBIDDEN', 'Administrators cannot remove administrators.');
    }
    return this.projects.memberships.get(teamId)?.delete(target.userId) ?? false;
  }
}

describe('authenticated profile, project, and team API', () => {
  let repository: InMemoryProjectRepository;
  let teamRepository: InMemoryTeamRepository;
  let dashboardRepository: InMemoryDashboardRepository;
  let activityRepository: InMemoryActivityRepository;
  let analyticsRepository: InMemoryAnalyticsRepository;
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    repository = new InMemoryProjectRepository();
    teamRepository = new InMemoryTeamRepository(repository);
    dashboardRepository = new InMemoryDashboardRepository();
    activityRepository = new InMemoryActivityRepository();
    analyticsRepository = new InMemoryAnalyticsRepository();
    const app = createApp({
      repository,
      dashboardRepository,
      teamRepository,
      activityRepository,
      analyticsRepository,
      verifyAccessToken: async (token) => {
        if (token === 'valid-user-unverified') {
          return {
            id: 'auth-unverified',
            email: 'two@example.test',
            emailVerified: false
          };
        }
        const suffix = token.replace('valid-user-', '');
        if (!['one', 'two', 'three', 'four'].includes(suffix)) return null;
        return {
          id: `auth-${suffix}`,
          email: `${suffix}@example.test`,
          emailVerified: true
        };
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

  it('requires Supabase authentication for Jira status and scopes it to the verified profile', async () => {
    const status = vi.fn(async (userId: string) => ({ configured: true, connected: false, integrations: [], userId }));
    const app = createApp({
      repository, dashboardRepository, teamRepository,
      jiraService: { status } as never,
      verifyAccessToken: async (token) => token === 'valid-user-one' ? { id: 'auth-one', email: 'one@example.test', emailVerified: true } : null
    });
    const jiraServer = app.listen(0);
    await once(jiraServer, 'listening');
    const address = jiraServer.address() as AddressInfo;
    const jiraBaseUrl = `http://127.0.0.1:${address.port}`;
    try {
      const anonymous = await fetch(`${jiraBaseUrl}/api/jira/status`);
      const authenticated = await fetch(`${jiraBaseUrl}/api/jira/status`, { headers: { Authorization: 'Bearer valid-user-one' } });
      const body = await authenticated.json() as { data: { userId: string } };
      expect(anonymous.status).toBe(401);
      expect(authenticated.status).toBe(200);
      expect(body.data.userId).toBe('profile-auth-one');
      expect(status).toHaveBeenCalledWith('profile-auth-one');
    } finally {
      await new Promise<void>((resolve, reject) => jiraServer.close((error) => error ? reject(error) : resolve()));
    }
  });

  it('scopes notification and activity operations to the authenticated profile', async () => {
    const headers = { Authorization: 'Bearer valid-user-one' };
    const notifications = await fetch(`${baseUrl}/api/notifications`, { headers });
    expect(notifications.status).toBe(200);
    expect(activityRepository.lastUserId).toBe('profile-auth-one');
    const activity = await fetch(`${baseUrl}/api/activity`, { headers });
    expect(activity.status).toBe(200);
    expect(activityRepository.lastUserId).toBe('profile-auth-one');
    const foreign = await fetch(`${baseUrl}/api/notifications/foreign-notification/read`, { method: 'PATCH', headers });
    expect(foreign.status).toBe(404);
    expect(activityRepository.lastUserId).toBe('profile-auth-one');
  });

  it('authorizes analytics, validates filters, and hides inaccessible projects', async () => {
    const unauthorized = await fetch(`${baseUrl}/api/analytics/summary`);
    expect(unauthorized.status).toBe(401);
    const headers = { Authorization: 'Bearer valid-user-one' };
    const invalid = await fetch(`${baseUrl}/api/analytics/summary?range=365d`, { headers });
    expect(invalid.status).toBe(400);
    const scoped = await fetch(`${baseUrl}/api/analytics/summary?range=7d&projectId=project-1`, { headers });
    expect(scoped.status).toBe(200);
    expect(analyticsRepository.lastRequest).toEqual({ userId: 'profile-auth-one', range: '7d', projectId: 'project-1' });
    const foreign = await fetch(`${baseUrl}/api/analytics/summary?projectId=foreign-project`, { headers });
    expect(foreign.status).toBe(404);
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

  it('enforces team roles, secure invitations, shared projects, and cross-team isolation', async () => {
    const ownerHeaders = {
      Authorization: 'Bearer valid-user-one',
      'Content-Type': 'application/json'
    };
    const viewerHeaders = {
      Authorization: 'Bearer valid-user-two',
      'Content-Type': 'application/json'
    };
    const outsiderHeaders = { Authorization: 'Bearer valid-user-three' };

    const teamResponse = await fetch(`${baseUrl}/api/teams`, {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({ name: 'Shared team' })
    });
    const teamResult = (await teamResponse.json()) as { data: TeamDetails };
    const teamId = teamResult.data.id;
    expect(teamResponse.status).toBe(201);

    const otherTeamResponse = await fetch(`${baseUrl}/api/teams`, {
      method: 'POST',
      headers: { ...ownerHeaders, Authorization: 'Bearer valid-user-three' },
      body: JSON.stringify({ name: 'Other team' })
    });
    expect(otherTeamResponse.status).toBe(201);

    const invitationResponse = await fetch(`${baseUrl}/api/teams/${teamId}/invitations`, {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({ email: 'two@example.test', role: 'VIEWER' })
    });
    const invitationResult = (await invitationResponse.json()) as {
      data: {
        id: string;
        inviteUrl: string;
        tokenHash?: string;
        emailStatus: InvitationEmailStatus;
      };
    };
    const invitationToken = new URL(invitationResult.data.inviteUrl).hash.slice('#invite='.length);
    const storedInvitation = Array.from(teamRepository.invitations.values()).find(
      (invitation) => invitation.id === invitationResult.data.id
    );

    expect(invitationResponse.status).toBe(201);
    expect(invitationResult.data.emailStatus).toBe('NOT_CONFIGURED');
    expect(invitationToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(invitationResult.data.tokenHash).toBeUndefined();
    expect(storedInvitation?.tokenHash).toBe(
      createHash('sha256').update(invitationToken).digest('hex')
    );

    const accept = (authorization: string) =>
      fetch(`${baseUrl}/api/team-invitations/accept`, {
        method: 'POST',
        headers: { Authorization: authorization, 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: invitationToken })
      });
    expect((await accept('Bearer valid-user-unverified')).status).toBe(403);
    expect((await accept('Bearer valid-user-three')).status).toBe(403);
    expect((await accept('Bearer valid-user-two')).status).toBe(200);
    expect((await accept('Bearer valid-user-two')).status).toBe(410);

    const teamDetailsResponse = await fetch(`${baseUrl}/api/teams/${teamId}`, {
      headers: viewerHeaders
    });
    const teamDetails = (await teamDetailsResponse.json()) as { data: TeamDetails };
    const viewerMember = teamDetails.data.members.find(
      (member) => member.userId === 'profile-auth-two'
    );
    expect(teamDetailsResponse.status).toBe(200);
    expect(viewerMember?.role).toBe('VIEWER');
    const viewerTeams = await fetch(`${baseUrl}/api/teams`, { headers: viewerHeaders });
    expect((await viewerTeams.json() as { data: unknown[] }).data).toHaveLength(1);

    const sharedProjectResponse = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({
        name: 'Shared project',
        url: 'https://shared.example.test',
        teamId
      })
    });
    const sharedProject = (await sharedProjectResponse.json()) as { data: ProjectRecord };
    expect(sharedProjectResponse.status).toBe(201);

    const viewerProjectResponse = await fetch(
      `${baseUrl}/api/projects/${sharedProject.data.id}`,
      { headers: viewerHeaders }
    );
    const viewerProject = (await viewerProjectResponse.json()) as { data: ProjectRecord };
    expect(viewerProjectResponse.status).toBe(200);
    expect(viewerProject.data.canEdit).toBe(false);
    expect(viewerProject.data.canDelete).toBe(false);

    const viewerCreate = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: viewerHeaders,
      body: JSON.stringify({
        name: 'Viewer project',
        url: 'https://viewer.example.test',
        teamId
      })
    });
    const viewerUpdate = await fetch(`${baseUrl}/api/projects/${sharedProject.data.id}`, {
      method: 'PUT',
      headers: viewerHeaders,
      body: JSON.stringify({ name: 'Viewer changed this' })
    });
    const viewerDelete = await fetch(`${baseUrl}/api/projects/${sharedProject.data.id}`, {
      method: 'DELETE',
      headers: viewerHeaders
    });
    const viewerInvite = await fetch(`${baseUrl}/api/teams/${teamId}/invitations`, {
      method: 'POST',
      headers: viewerHeaders,
      body: JSON.stringify({ email: 'four@example.test' })
    });
    expect(viewerCreate.status).toBe(403);
    expect(viewerUpdate.status).toBe(404);
    expect(viewerDelete.status).toBe(404);
    expect(viewerInvite.status).toBe(403);

    const outsiderProject = await fetch(
      `${baseUrl}/api/projects/${sharedProject.data.id}`,
      { headers: outsiderHeaders }
    );
    const outsiderTeam = await fetch(`${baseUrl}/api/teams/${teamId}`, {
      headers: outsiderHeaders
    });
    const outsiderProjects = await fetch(`${baseUrl}/api/projects`, {
      headers: outsiderHeaders
    });
    expect(outsiderProject.status).toBe(404);
    expect(outsiderTeam.status).toBe(404);
    expect((await outsiderProjects.json() as { data: { items: ProjectRecord[] } }).data.items)
      .toHaveLength(0);

    const developerPromotion = await fetch(
      `${baseUrl}/api/teams/${teamId}/members/${viewerMember?.id}`,
      {
        method: 'PATCH',
        headers: ownerHeaders,
        body: JSON.stringify({ role: 'DEVELOPER' })
      }
    );
    expect(developerPromotion.status).toBe(200);

    const developerHeaders = {
      Authorization: 'Bearer valid-user-two',
      'Content-Type': 'application/json'
    };
    const developerCreate = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: developerHeaders,
      body: JSON.stringify({
        name: 'Developer project',
        url: 'https://developer.example.test',
        teamId
      })
    });
    const developerProject = (await developerCreate.json()) as { data: ProjectRecord };
    const developerUpdate = await fetch(
      `${baseUrl}/api/projects/${sharedProject.data.id}`,
      {
        method: 'PUT',
        headers: developerHeaders,
        body: JSON.stringify({ description: 'Updated by a developer' })
      }
    );
    const developerDelete = await fetch(
      `${baseUrl}/api/projects/${sharedProject.data.id}`,
      { method: 'DELETE', headers: developerHeaders }
    );
    expect(developerCreate.status).toBe(201);
    expect(developerUpdate.status).toBe(200);
    expect(developerDelete.status).toBe(404);
    expect(developerProject.data.teamId).toBe(teamId);

    const removeDeveloper = await fetch(
      `${baseUrl}/api/teams/${teamId}/members/${viewerMember?.id}`,
      { method: 'DELETE', headers: ownerHeaders }
    );
    const removedOwnerProject = await fetch(
      `${baseUrl}/api/projects/${developerProject.data.id}`,
      { headers: developerHeaders }
    );
    expect(removeDeveloper.status).toBe(204);
    expect(removedOwnerProject.status).toBe(404);
  });

  it('restricts admin actions and rejects expired or revoked invitations', async () => {
    const ownerHeaders = {
      Authorization: 'Bearer valid-user-one',
      'Content-Type': 'application/json'
    };
    const teamResponse = await fetch(`${baseUrl}/api/teams`, {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({ name: 'Admin team' })
    });
    const team = (await teamResponse.json()) as { data: TeamDetails };
    const teamId = team.data.id;

    const createInvitation = async (email: string, role: string) => {
      const response = await fetch(`${baseUrl}/api/teams/${teamId}/invitations`, {
        method: 'POST',
        headers: ownerHeaders,
        body: JSON.stringify({ email, role })
      });
      return {
        response,
        data: (await response.json()) as { data: { id: string; inviteUrl: string } }
      };
    };

    const adminInvite = await createInvitation('two@example.test', 'ADMIN');
    const adminToken = new URL(adminInvite.data.data.inviteUrl).hash.slice('#invite='.length);
    const adminAccept = await fetch(`${baseUrl}/api/team-invitations/accept`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid-user-two',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ token: adminToken })
    });
    const adminDetailsResponse = await fetch(`${baseUrl}/api/teams/${teamId}`, {
      headers: { Authorization: 'Bearer valid-user-two' }
    });
    const adminDetails = (await adminDetailsResponse.json()) as { data: TeamDetails };
    const adminMember = adminDetails.data.members.find(
      (member) => member.userId === 'profile-auth-two'
    );

    expect(adminInvite.response.status).toBe(201);
    expect(adminAccept.status).toBe(200);
    expect(adminMember?.role).toBe('ADMIN');

    const ownerMember = adminDetails.data.members.find(
      (member) => member.userId === 'profile-auth-one'
    );
    const adminPromotion = await fetch(
      `${baseUrl}/api/teams/${teamId}/members/${ownerMember?.id}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: 'Bearer valid-user-two',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ role: 'DEVELOPER' })
      }
    );
    const adminGrant = await fetch(`${baseUrl}/api/teams/${teamId}/invitations`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid-user-two',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email: 'four@example.test', role: 'ADMIN' })
    });
    const adminDeleteTeam = await fetch(`${baseUrl}/api/teams/${teamId}`, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer valid-user-two' }
    });
    const adminUpdateTeam = await fetch(`${baseUrl}/api/teams/${teamId}`, {
      method: 'PUT',
      headers: {
        Authorization: 'Bearer valid-user-two',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ description: 'Updated by an administrator' })
    });
    expect(adminPromotion.status).toBe(403);
    expect(adminGrant.status).toBe(403);
    expect(adminDeleteTeam.status).toBe(403);
    expect(adminUpdateTeam.status).toBe(200);

    const otherAdminInvite = await createInvitation('four@example.test', 'ADMIN');
    const otherAdminToken = new URL(otherAdminInvite.data.data.inviteUrl).hash.slice('#invite='.length);
    const otherAdminAccept = await fetch(`${baseUrl}/api/team-invitations/accept`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid-user-four',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ token: otherAdminToken })
    });
    const otherAdminDetailsResponse = await fetch(`${baseUrl}/api/teams/${teamId}`, {
      headers: { Authorization: 'Bearer valid-user-two' }
    });
    const otherAdminDetails = (await otherAdminDetailsResponse.json()) as { data: TeamDetails };
    const otherAdminMember = otherAdminDetails.data.members.find(
      (member) => member.userId === 'profile-auth-four'
    );
    const adminRemoveOtherAdmin = await fetch(
      `${baseUrl}/api/teams/${teamId}/members/${otherAdminMember?.id}`,
      { method: 'DELETE', headers: { Authorization: 'Bearer valid-user-two' } }
    );
    const ownerRemoveOwner = await fetch(
      `${baseUrl}/api/teams/${teamId}/members/${ownerMember?.id}`,
      { method: 'DELETE', headers: { Authorization: 'Bearer valid-user-one' } }
    );
    expect(otherAdminInvite.response.status).toBe(201);
    expect(otherAdminAccept.status).toBe(200);
    expect(adminRemoveOtherAdmin.status).toBe(403);
    expect(ownerRemoveOwner.status).toBe(403);

    const revokedInvite = await createInvitation('three@example.test', 'VIEWER');
    const revokedToken = new URL(revokedInvite.data.data.inviteUrl).hash.slice('#invite='.length);
    const revokeResponse = await fetch(
      `${baseUrl}/api/teams/${teamId}/invitations/${revokedInvite.data.data.id}`,
      { method: 'DELETE', headers: ownerHeaders }
    );
    const revokedAccept = await fetch(`${baseUrl}/api/team-invitations/accept`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid-user-three',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ token: revokedToken })
    });
    expect(revokedInvite.response.status).toBe(201);
    expect(revokeResponse.status).toBe(204);
    expect(revokedAccept.status).toBe(410);

    const expiredInvite = await createInvitation('four@example.test', 'VIEWER');
    const expiredToken = new URL(expiredInvite.data.data.inviteUrl).hash.slice('#invite='.length);
    const storedExpired = Array.from(teamRepository.invitations.values()).find(
      (invitation) => invitation.id === expiredInvite.data.data.id
    );
    if (!storedExpired) throw new Error('Test invitation was not persisted.');
    storedExpired.expiresAt = new Date(Date.now() - 1000);
    const expiredAccept = await fetch(`${baseUrl}/api/team-invitations/accept`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid-user-four',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ token: expiredToken })
    });
    expect(expiredInvite.response.status).toBe(201);
    expect(expiredAccept.status).toBe(410);

    const ownerRemoveAdmin = await fetch(
      `${baseUrl}/api/teams/${teamId}/members/${otherAdminMember?.id}`,
      { method: 'DELETE', headers: { Authorization: 'Bearer valid-user-one' } }
    );
    const conflictingPersonal = await repository.createProject('profile-auth-one', {
      name: 'Team project conflict',
      url: 'https://personal.example.test'
    });
    const teamOwnedProjectResponse = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid-user-two',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: conflictingPersonal.name,
        url: 'https://team.example.test',
        teamId
      })
    });
    const teamOwnedProject = (await teamOwnedProjectResponse.json()) as { data: ProjectRecord };
    const ownerDeleteTeam = await fetch(`${baseUrl}/api/teams/${teamId}`, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer valid-user-one' }
    });
    const stillSharedProject = await fetch(
      `${baseUrl}/api/projects/${teamOwnedProject.data.id}`,
      { headers: { Authorization: 'Bearer valid-user-two' } }
    );
    expect(teamOwnedProjectResponse.status).toBe(201);
    expect(ownerDeleteTeam.status).toBe(409);
    expect(stillSharedProject.status).toBe(200);

    const renameTeamProject = await fetch(
      `${baseUrl}/api/projects/${teamOwnedProject.data.id}`,
      {
        method: 'PUT',
        headers: {
          Authorization: 'Bearer valid-user-two',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name: 'Team project preserved' })
      }
    );
    const successfulDeleteTeam = await fetch(`${baseUrl}/api/teams/${teamId}`, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer valid-user-one' }
    });
    const privateProject = await fetch(
      `${baseUrl}/api/projects/${teamOwnedProject.data.id}`,
      { headers: { Authorization: 'Bearer valid-user-one' } }
    );
    const formerMemberProject = await fetch(
      `${baseUrl}/api/projects/${teamOwnedProject.data.id}`,
      { headers: { Authorization: 'Bearer valid-user-two' } }
    );
    const deletedTeam = await fetch(`${baseUrl}/api/teams/${teamId}`, {
      headers: { Authorization: 'Bearer valid-user-one' }
    });
    expect(ownerRemoveAdmin.status).toBe(204);
    expect(renameTeamProject.status).toBe(200);
    expect(successfulDeleteTeam.status).toBe(204);
    expect((await privateProject.json() as { data: ProjectRecord }).data.teamId).toBeNull();
    expect(formerMemberProject.status).toBe(404);
    expect(deletedTeam.status).toBe(404);
  });

  it('keeps manual invite links available when the configured email sender fails', async () => {
    const app = createApp({
      repository,
      dashboardRepository,
      teamRepository,
      verifyAccessToken: async (token) => {
        if (token !== 'valid-user-one') return null;
        return {
          id: 'auth-one',
          email: 'one@example.test',
          emailVerified: true
        };
      },
      sendInvitationEmail: async () => {
        throw new Error('Provider failed; raw provider detail must not be surfaced.');
      }
    });
    const emailServer = app.listen(0);
    await once(emailServer, 'listening');
    const address = emailServer.address() as AddressInfo;
    const emailBaseUrl = `http://127.0.0.1:${address.port}`;

    try {
      const teamResponse = await fetch(`${emailBaseUrl}/api/teams`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid-user-one',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name: 'Email failure team' })
      });
      const team = (await teamResponse.json()) as { data: TeamDetails };
      const invitationResponse = await fetch(
        `${emailBaseUrl}/api/teams/${team.data.id}/invitations`,
        {
          method: 'POST',
          headers: {
            Authorization: 'Bearer valid-user-one',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ email: 'four@example.test' })
        }
      );
      const invitation = (await invitationResponse.json()) as {
        data: { id: string; inviteUrl: string; emailStatus: InvitationEmailStatus };
      };
      const storedInvitation = teamRepository.invitations.get(invitation.data.id);
      expect(teamResponse.status).toBe(201);
      expect(invitationResponse.status).toBe(201);
      expect(invitation.data.inviteUrl).toContain('#invite=');
      expect(invitation.data.emailStatus).toBe('FAILED');
      expect(storedInvitation?.emailStatus).toBe('FAILED');
    } finally {
      await new Promise<void>((resolve, reject) => {
        emailServer.close((error) => error ? reject(error) : resolve());
      });
    }
  });
});
