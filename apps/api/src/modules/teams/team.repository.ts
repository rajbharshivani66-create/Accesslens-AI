import type { InvitationEmailStatus, TeamMemberRole } from '@accesslens-ai/database';

export interface TeamMemberSummary {
  id: string;
  userId: string;
  email: string;
  fullName: string | null;
  role: TeamMemberRole;
  joinedAt: Date;
}

export interface TeamInvitationSummary {
  id: string;
  email: string;
  role: Exclude<TeamMemberRole, 'OWNER'>;
  emailStatus: InvitationEmailStatus;
  expiresAt: Date;
  createdAt: Date;
}

export interface TeamSummary {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  memberCount: number;
  myRole: TeamMemberRole;
}

export interface TeamDetails extends TeamSummary {
  currentMemberId: string;
  members: TeamMemberSummary[];
  invitations: TeamInvitationSummary[];
}

export interface TeamInvitationInput {
  email: string;
  tokenHash: string;
  role: Exclude<TeamMemberRole, 'OWNER'>;
  emailStatus: InvitationEmailStatus;
  expiresAt: Date;
}

export interface IssuedTeamInvitation extends TeamInvitationSummary {
  token: string;
}

export interface TeamRepository {
  listTeams(userId: string): Promise<TeamSummary[]>;
  getTeam(userId: string, teamId: string): Promise<TeamDetails | null>;
  createTeam(userId: string, name: string, description?: string): Promise<TeamDetails>;
  updateTeam(
    userId: string,
    teamId: string,
    input: { name?: string; description?: string | null }
  ): Promise<TeamDetails | null>;
  deleteTeam(userId: string, teamId: string): Promise<boolean>;
  createInvitation(
    userId: string,
    teamId: string,
    input: TeamInvitationInput
  ): Promise<TeamInvitationSummary>;
  updateInvitationEmailStatus(
    invitationId: string,
    status: InvitationEmailStatus
  ): Promise<void>;
  acceptInvitation(
    userId: string,
    email: string,
    tokenHash: string,
    acceptedAt: Date
  ): Promise<TeamSummary>;
  revokeInvitation(userId: string, teamId: string, invitationId: string): Promise<boolean>;
  updateMemberRole(
    userId: string,
    teamId: string,
    memberId: string,
    role: Exclude<TeamMemberRole, 'OWNER'>
  ): Promise<TeamDetails | null>;
  removeMember(userId: string, teamId: string, memberId: string): Promise<boolean>;
}
