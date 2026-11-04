import type { PrismaClient } from '@accesslens-ai/database';
import type { AuthIdentity } from '../modules/auth/auth.types.js';
import type {
  ProfileInput,
  ProfileRecord,
  ProjectInput,
  ProjectRecord,
  ProjectRepository
} from '../modules/projects/project.repository.js';

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

    if (updated.count === 0) {
      return null;
    }

    return this.getProfile(authUserId);
  }

  async listProjects(
    ownerId: string,
    skip: number,
    take: number
  ): Promise<{ items: ProjectRecord[]; total: number }> {
    const where = { ownerId };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.project.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take
      }),
      this.prisma.project.count({ where })
    ]);

    return { items, total };
  }

  getProject(ownerId: string, projectId: string): Promise<ProjectRecord | null> {
    return this.prisma.project.findFirst({ where: { id: projectId, ownerId } });
  }

  createProject(ownerId: string, input: ProjectInput): Promise<ProjectRecord> {
    return this.prisma.project.create({ data: { ...input, ownerId } });
  }

  async updateProject(
    ownerId: string,
    projectId: string,
    input: Partial<ProjectInput>
  ): Promise<ProjectRecord | null> {
    const updated = await this.prisma.project.updateMany({
      where: { id: projectId, ownerId },
      data: input
    });

    if (updated.count === 0) {
      return null;
    }

    return this.getProject(ownerId, projectId);
  }

  async deleteProject(ownerId: string, projectId: string): Promise<boolean> {
    const deleted = await this.prisma.project.deleteMany({
      where: { id: projectId, ownerId }
    });

    return deleted.count > 0;
  }
}
