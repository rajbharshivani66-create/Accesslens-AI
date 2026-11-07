import type { AuthIdentity } from '../auth/auth.types.js';
import type { TeamMemberRole } from '@accesslens-ai/database';

export interface ProfileRecord {
  id: string;
  authUserId: string;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
  role: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectRecord {
  id: string;
  ownerId: string;
  teamId: string | null;
  name: string;
  url: string;
  description: string | null;
  team: { id: string; name: string } | null;
  accessRole: TeamMemberRole | null;
  canEdit: boolean;
  canDelete: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectInput {
  name: string;
  url: string;
  description?: string;
  teamId?: string | null;
}

export type ProjectUpdateInput = Partial<Omit<ProjectInput, 'teamId'>>;

export interface ProfileInput {
  fullName?: string | null;
  avatarUrl?: string | null;
}

export interface ProjectRepository {
  ping(): Promise<void>;
  ensureProfile(identity: AuthIdentity): Promise<ProfileRecord>;
  getProfile(authUserId: string): Promise<ProfileRecord | null>;
  updateProfile(authUserId: string, input: ProfileInput): Promise<ProfileRecord | null>;
  listProjects(
    userId: string,
    skip: number,
    take: number
  ): Promise<{ items: ProjectRecord[]; total: number }>;
  getProject(userId: string, projectId: string): Promise<ProjectRecord | null>;
  createProject(userId: string, input: ProjectInput): Promise<ProjectRecord>;
  updateProject(
    userId: string,
    projectId: string,
    input: ProjectUpdateInput
  ): Promise<ProjectRecord | null>;
  deleteProject(userId: string, projectId: string): Promise<boolean>;
}
