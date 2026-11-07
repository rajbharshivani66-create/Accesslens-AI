import { Prisma, TeamMemberRole, type PrismaClient } from '@accesslens-ai/database';
import type { AuthIdentity } from '../modules/auth/auth.types.js';
import type {
  ProfileInput,
  ProfileRecord,
  ProjectInput,
  ProjectRecord,
  ProjectRepository,
  ProjectUpdateInput
} from '../modules/projects/project.repository.js';
import { ApiError } from '../utils/api-error.js';

const writableTeamRoles: TeamMemberRole[] = [
  TeamMemberRole.OWNER,
  TeamMemberRole.ADMIN,
  TeamMemberRole.DEVELOPER
];
const deletableTeamRoles: TeamMemberRole[] = [TeamMemberRole.OWNER, TeamMemberRole.ADMIN];

const projectReadWhere = (userId: string): Prisma.ProjectWhereInput => ({
  OR: [
    { ownerId: userId, teamId: null },
    { team: { members: { some: { userId } } } }
  ]
});

function projectWriteWhere(
  userId: string,
  roles: TeamMemberRole[]
): Prisma.ProjectWhereInput {
  return {
    OR: [
      { ownerId: userId, teamId: null },
      { team: { members: { some: { userId, role: { in: roles } } } } }
    ]
  };
}

type ProjectWithTeam = Prisma.ProjectGetPayload<{
  include: {
    team: {
      include: { members: { where: { userId: string }; select: { role: true } } };
    };
  };
}>;

function toProjectRecord(project: ProjectWithTeam, userId: string): ProjectRecord {
  const memberRole = project.team?.members[0]?.role ?? null;
  const isPersonalOwner = project.teamId === null && project.ownerId === userId;
  const accessRole = memberRole ?? (isPersonalOwner ? TeamMemberRole.OWNER : null);
  return {
    id: project.id,
    ownerId: project.ownerId,
    teamId: project.teamId,
    name: project.name,
    url: project.url,
    description: project.description,
    team: project.team ? { id: project.team.id, name: project.team.name } : null,
    accessRole,
    canEdit:
      isPersonalOwner || (memberRole !== null && writableTeamRoles.includes(memberRole)),
    canDelete:
      isPersonalOwner || (memberRole !== null && deletableTeamRoles.includes(memberRole)),
    createdAt: project.createdAt,
    updatedAt: project.updatedAt
  };
}

const teamProjectInclude = (userId: string) => ({
  team: {
    include: {
      members: { where: { userId }, select: { role: true } }
    }
  }
});

async function assertCanCreateForTeam(
  transaction: Prisma.TransactionClient,
  userId: string,
  teamId: string | null | undefined
): Promise<void> {
  if (!teamId) return;
  const membership = await transaction.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId } },
    select: { role: true }
  });
  if (!membership) {
    throw new ApiError(404, 'TEAM_NOT_FOUND', 'The team was not found.');
  }
  if (!writableTeamRoles.includes(membership.role)) {
    throw new ApiError(403, 'FORBIDDEN', 'Your team role does not allow creating projects.');
  }
}

export class PrismaProjectRepository implements ProjectRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async ping(): Promise<void> {
    await this.prisma.$queryRaw`SELECT 1`;
  }

  ensureProfile(identity: AuthIdentity): Promise<ProfileRecord> {
    return this.prisma.userProfile.upsert({
      where: { authUserId: identity.id },
      create: {
        authUserId: identity.id,
        email: identity.email,
        fullName: identity.fullName ?? undefined
      },
      update: { email: identity.email }
    });
  }

  getProfile(authUserId: string): Promise<ProfileRecord | null> {
    return this.prisma.userProfile.findUnique({ where: { authUserId } });
  }

  async updateProfile(
    authUserId: string,
    input: ProfileInput
  ): Promise<ProfileRecord | null> {
    const updated = await this.prisma.userProfile.updateMany({
      where: { authUserId },
      data: input
    });

    if (updated.count === 0) return null;
    return this.getProfile(authUserId);
  }

  async listProjects(
    userId: string,
    skip: number,
    take: number
  ): Promise<{ items: ProjectRecord[]; total: number }> {
    const where = projectReadWhere(userId);
    const [projects, total] = await this.prisma.$transaction([
      this.prisma.project.findMany({
        where,
        include: teamProjectInclude(userId),
        orderBy: { createdAt: 'desc' },
        skip,
        take
      }),
      this.prisma.project.count({ where })
    ]);

    return { items: projects.map((project) => toProjectRecord(project, userId)), total };
  }

  async getProject(userId: string, projectId: string): Promise<ProjectRecord | null> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, ...projectReadWhere(userId) },
      include: teamProjectInclude(userId)
    });
    return project ? toProjectRecord(project, userId) : null;
  }

  async createProject(userId: string, input: ProjectInput): Promise<ProjectRecord> {
    const projectId = await this.prisma.$transaction(async (transaction) => {
      await assertCanCreateForTeam(transaction, userId, input.teamId);
      const project = await transaction.project.create({
        data: {
          name: input.name,
          url: input.url,
          description: input.description,
          ownerId: userId,
          teamId: input.teamId ?? null
        },
        select: { id: true }
      });
      await transaction.activityLog.create({ data: { userId, action: 'project.created', entityType: 'Project', entityId: project.id, details: { name: input.name, teamId: input.teamId ?? null } } });
      return project.id;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    const project = await this.getProject(userId, projectId);
    if (!project) {
      throw new ApiError(500, 'PROJECT_CREATION_FAILED', 'The project could not be created.');
    }
    return project;
  }

  async updateProject(
    userId: string,
    projectId: string,
    input: ProjectUpdateInput
  ): Promise<ProjectRecord | null> {
    const updated = await this.prisma.project.updateMany({
      where: { id: projectId, ...projectWriteWhere(userId, writableTeamRoles) },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.url !== undefined ? { url: input.url } : {}),
        ...(input.description !== undefined ? { description: input.description } : {})
      }
    });

    if (updated.count === 0) return null;
    await this.prisma.activityLog.create({ data: { userId, action: 'project.updated', entityType: 'Project', entityId: projectId, details: { fields: Object.keys(input) } } });
    return this.getProject(userId, projectId);
  }

  async deleteProject(userId: string, projectId: string): Promise<boolean> {
    const deleted = await this.prisma.project.deleteMany({
      where: { id: projectId, ...projectWriteWhere(userId, deletableTeamRoles) }
    });
    if (deleted.count) await this.prisma.activityLog.create({ data: { userId, action: 'project.deleted', entityType: 'Project', entityId: projectId } });
    return deleted.count > 0;
  }
}
