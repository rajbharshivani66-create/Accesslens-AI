import type { AuthIdentity } from '../auth/auth.types.js';

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
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectInput {
  name: string;
  url: string;
  description?: string;
}

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
    ownerId: string,
    skip: number,
    take: number
  ): Promise<{ items: ProjectRecord[]; total: number }>;
  getProject(ownerId: string, projectId: string): Promise<ProjectRecord | null>;
  createProject(ownerId: string, input: ProjectInput): Promise<ProjectRecord>;
  updateProject(
    ownerId: string,
    projectId: string,
    input: Partial<ProjectInput>
  ): Promise<ProjectRecord | null>;
  deleteProject(ownerId: string, projectId: string): Promise<boolean>;
}
