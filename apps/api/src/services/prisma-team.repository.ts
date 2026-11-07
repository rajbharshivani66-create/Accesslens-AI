import {
  Prisma,
  type InvitationEmailStatus,
  TeamMemberRole,
  type PrismaClient
} from '@accesslens-ai/database';
import { ApiError } from '../utils/api-error.js';
import type {
  TeamDetails,
  TeamInvitationInput,
  TeamInvitationSummary,
  TeamMemberSummary,
  TeamRepository,
  TeamSummary
} from '../modules/teams/team.repository.js';

type Db = PrismaClient | Prisma.TransactionClient;

const managerRoles: TeamMemberRole[] = [TeamMemberRole.OWNER, TeamMemberRole.ADMIN];

function isManager(role: TeamMemberRole): boolean {
  return managerRoles.includes(role);
}

function toTeamDetails(
  team: {
    id: string;
    name: string;
    description: string | null;
    createdAt: Date;
    updatedAt: Date;
    members: Array<{
      id: string;
      userId: string;
      role: TeamMemberRole;
      createdAt: Date;
      user: { email: string; fullName: string | null };
    }>;
    invitations: Array<{
      id: string;
      email: string;
      role: TeamMemberRole;
      emailStatus: InvitationEmailStatus;
      expiresAt: Date;
      createdAt: Date;
    }>;
  },
  userId: string
): TeamDetails {
  const myMembership = team.members.find((member) => member.userId === userId);
  if (!myMembership) {
    throw new ApiError(404, 'TEAM_NOT_FOUND', 'The team was not found.');
  }

  return {
    id: team.id,
    name: team.name,
    description: team.description,
    createdAt: team.createdAt,
    updatedAt: team.updatedAt,
    memberCount: team.members.length,
    myRole: myMembership.role,
    currentMemberId: myMembership.id,
    members: team.members.map((member): TeamMemberSummary => ({
      id: member.id,
      userId: member.userId,
      email: member.user.email,
      fullName: member.user.fullName,
      role: member.role,
      joinedAt: member.createdAt
    })),
    invitations: isManager(myMembership.role)
      ? team.invitations.map((invitation): TeamInvitationSummary => ({
          id: invitation.id,
          email: invitation.email,
          role: invitation.role as Exclude<TeamMemberRole, 'OWNER'>,
          emailStatus: invitation.emailStatus,
          expiresAt: invitation.expiresAt,
          createdAt: invitation.createdAt
        }))
      : []
  };
}

async function findTeamDetails(
  db: Db,
  userId: string,
  teamId: string
): Promise<TeamDetails | null> {
  const team = await db.team.findFirst({
    where: { id: teamId, members: { some: { userId } } },
    include: {
      members: {
        orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
        include: { user: { select: { email: true, fullName: true } } }
      },
      invitations: {
        where: {
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: new Date() }
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          role: true,
          emailStatus: true,
          expiresAt: true,
          createdAt: true
        }
      }
    }
  });
  return team ? toTeamDetails(team, userId) : null;
}

async function requireTeamRole(
  db: Db,
  userId: string,
  teamId: string,
  allowed: TeamMemberRole[]
): Promise<TeamMemberRole> {
  const membership = await db.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId } },
    select: { role: true }
  });
  if (!membership) {
    throw new ApiError(404, 'TEAM_NOT_FOUND', 'The team was not found.');
  }
  if (!allowed.includes(membership.role)) {
    throw new ApiError(403, 'FORBIDDEN', 'Your team role does not allow this action.');
  }
  return membership.role;
}

export class PrismaTeamRepository implements TeamRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listTeams(userId: string): Promise<TeamSummary[]> {
    const teams = await this.prisma.team.findMany({
      where: { members: { some: { userId } } },
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { members: true } },
        members: { where: { userId }, select: { role: true } }
      }
    });

    return teams.flatMap((team): TeamSummary[] => {
      const membership = team.members[0];
      if (!membership) return [];
      return [{
        id: team.id,
        name: team.name,
        description: team.description,
        createdAt: team.createdAt,
        updatedAt: team.updatedAt,
        memberCount: team._count.members,
        myRole: membership.role
      }];
    });
  }

  getTeam(userId: string, teamId: string): Promise<TeamDetails | null> {
    return findTeamDetails(this.prisma, userId, teamId);
  }

  async createTeam(userId: string, name: string, description?: string): Promise<TeamDetails> {
    const team = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.team.create({
        data: { name, description: description ?? null }
      });
      await transaction.teamMember.create({
        data: { teamId: created.id, userId, role: TeamMemberRole.OWNER }
      });
      await transaction.activityLog.create({ data: { userId, action: 'team.created', entityType: 'Team', entityId: created.id, details: { name: created.name } } });
      return created;
    });
    const details = await this.getTeam(userId, team.id);
    if (!details) {
      throw new ApiError(500, 'TEAM_CREATION_FAILED', 'The team could not be created.');
    }
    return details;
  }

  async updateTeam(
    userId: string,
    teamId: string,
    input: { name?: string; description?: string | null }
  ): Promise<TeamDetails | null> {
    const updated = await this.prisma.$transaction(async (transaction) => {
      await requireTeamRole(transaction, userId, teamId, managerRoles);
      const updated = await transaction.team.updateMany({ where: { id: teamId }, data: input });
      if (updated.count) await transaction.activityLog.create({ data: { userId, action: 'team.updated', entityType: 'Team', entityId: teamId, details: { fields: Object.keys(input) } } });
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return updated.count ? this.getTeam(userId, teamId) : null;
  }

  async deleteTeam(userId: string, teamId: string): Promise<boolean> {
    return this.prisma.$transaction(async (transaction) => {
      await requireTeamRole(transaction, userId, teamId, [TeamMemberRole.OWNER]);
      const teamProjects = await transaction.project.findMany({
        where: { teamId },
        select: { id: true, name: true }
      });
      const projectNames = teamProjects.map((project) => project.name);
      if (new Set(projectNames).size !== projectNames.length) {
        throw new ApiError(
          409,
          'PROJECT_NAME_CONFLICT',
          'Rename duplicate team projects before deleting this team.'
        );
      }
      const conflictingProject = await transaction.project.findFirst({
        where: { ownerId: userId, teamId: { not: teamId }, name: { in: projectNames } },
        select: { id: true }
      });
      if (conflictingProject) {
        throw new ApiError(
          409,
          'PROJECT_NAME_CONFLICT',
          'Rename projects with conflicting names before deleting this team.'
        );
      }
      if (teamProjects.length) {
        await transaction.project.updateMany({
          where: { teamId },
          data: { ownerId: userId, teamId: null }
        });
      }
      const deleted = await transaction.team.deleteMany({
        where: { id: teamId }
      });
      if (deleted.count) await transaction.activityLog.create({ data: { userId, action: 'team.deleted', entityType: 'Team', entityId: teamId } });
      return deleted.count > 0;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async createInvitation(
    userId: string,
    teamId: string,
    input: TeamInvitationInput
  ): Promise<TeamInvitationSummary> {
    const email = input.email.trim().toLowerCase();
    return this.prisma.$transaction(async (transaction) => {
      const actorRole = await requireTeamRole(transaction, userId, teamId, managerRoles);
      if (actorRole === TeamMemberRole.ADMIN && input.role === TeamMemberRole.ADMIN) {
        throw new ApiError(403, 'FORBIDDEN', 'Only a team owner can invite an administrator.');
      }

      const existingMember = await transaction.teamMember.findFirst({
        where: { teamId, user: { email: { equals: email, mode: 'insensitive' } } },
        select: { id: true }
      });
      if (existingMember) {
        throw new ApiError(409, 'ALREADY_A_MEMBER', 'This user is already a team member.');
      }

      await transaction.teamInvitation.updateMany({
        where: {
          teamId,
          email: { equals: email, mode: 'insensitive' },
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { lte: new Date() }
        },
        data: { revokedAt: new Date() }
      });

      const invitation = await transaction.teamInvitation.create({
        data: {
          teamId,
          email,
          tokenHash: input.tokenHash,
          role: input.role,
          emailStatus: input.emailStatus,
          createdById: userId,
          expiresAt: input.expiresAt
        },
        select: {
          id: true,
          email: true,
          role: true,
          emailStatus: true,
          expiresAt: true,
          createdAt: true
        }
      });
      await transaction.activityLog.create({ data: { userId, action: 'team.invitation_created', entityType: 'TeamInvitation', entityId: invitation.id, details: { teamId, role: input.role } } });
      return {
        ...invitation,
        role: invitation.role as Exclude<TeamMemberRole, 'OWNER'>
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  updateInvitationEmailStatus(
    invitationId: string,
    status: InvitationEmailStatus
  ): Promise<void> {
    return this.prisma.teamInvitation.update({
      where: { id: invitationId },
      data: { emailStatus: status }
    }).then(() => undefined);
  }

  async acceptInvitation(
    userId: string,
    email: string,
    tokenHash: string,
    acceptedAt: Date
  ): Promise<TeamSummary> {
    return this.prisma.$transaction(async (transaction) => {
      const invitation = await transaction.teamInvitation.findUnique({
        where: { tokenHash },
        select: {
          id: true,
          teamId: true,
          email: true,
          role: true,
          expiresAt: true,
          acceptedAt: true,
          revokedAt: true
        }
      });

      if (
        !invitation ||
        invitation.acceptedAt ||
        invitation.revokedAt ||
        invitation.expiresAt <= acceptedAt
      ) {
        throw new ApiError(410, 'INVITATION_INVALID', 'The invitation is expired or no longer valid.');
      }
      if (invitation.email.toLowerCase() !== email.trim().toLowerCase()) {
        throw new ApiError(403, 'INVITATION_EMAIL_MISMATCH', 'Sign in with the email address this invitation was sent to.');
      }

      const membership = await transaction.teamMember.findUnique({
        where: { teamId_userId: { teamId: invitation.teamId, userId } },
        select: { id: true }
      });
      if (membership) {
        throw new ApiError(409, 'ALREADY_A_MEMBER', 'You are already a member of this team.');
      }

      const claimed = await transaction.teamInvitation.updateMany({
        where: {
          id: invitation.id,
          tokenHash,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: acceptedAt }
        },
        data: { acceptedAt }
      });
      if (claimed.count !== 1) {
        throw new ApiError(410, 'INVITATION_INVALID', 'The invitation has already been used or is no longer valid.');
      }

      await transaction.teamMember.create({
        data: {
          teamId: invitation.teamId,
          userId,
          role: invitation.role
        }
      });
      await transaction.activityLog.create({ data: { userId, action: 'team.invitation_accepted', entityType: 'Team', entityId: invitation.teamId, details: { role: invitation.role } } });
      const team = await transaction.team.findUnique({
        where: { id: invitation.teamId },
        select: {
          id: true,
          name: true,
          description: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { members: true } }
        }
      });
      if (!team) {
        throw new ApiError(410, 'INVITATION_INVALID', 'The team is no longer available.');
      }
      return {
        ...team,
        memberCount: team._count.members,
        myRole: invitation.role
      };
    });
  }

  async revokeInvitation(
    userId: string,
    teamId: string,
    invitationId: string
  ): Promise<boolean> {
    return this.prisma.$transaction(async (transaction) => {
      await requireTeamRole(transaction, userId, teamId, managerRoles);
      const updated = await transaction.teamInvitation.updateMany({
        where: {
          id: invitationId,
          teamId,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: new Date() }
        },
        data: { revokedAt: new Date() }
      });
      if (updated.count) await transaction.activityLog.create({ data: { userId, action: 'team.invitation_revoked', entityType: 'TeamInvitation', entityId: invitationId, details: { teamId } } });
      return updated.count > 0;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async updateMemberRole(
    userId: string,
    teamId: string,
    memberId: string,
    role: Exclude<TeamMemberRole, 'OWNER'>
  ): Promise<TeamDetails | null> {
    await this.prisma.$transaction(async (transaction) => {
      const actorRole = await requireTeamRole(transaction, userId, teamId, managerRoles);
      const target = await transaction.teamMember.findFirst({
        where: { id: memberId, teamId },
        select: { id: true, role: true }
      });
      if (!target) {
        throw new ApiError(404, 'MEMBER_NOT_FOUND', 'The team member was not found.');
      }
      if (target.role === TeamMemberRole.OWNER) {
        throw new ApiError(403, 'OWNER_PROTECTED', 'Team ownership cannot be changed here.');
      }
      if (
        actorRole === TeamMemberRole.ADMIN &&
        (target.role === TeamMemberRole.ADMIN || role === TeamMemberRole.ADMIN)
      ) {
        throw new ApiError(403, 'FORBIDDEN', 'Administrators cannot manage administrator roles.');
      }
      await transaction.teamMember.update({ where: { id: memberId }, data: { role } });
      await transaction.activityLog.create({ data: { userId, action: 'team.member_role_changed', entityType: 'TeamMember', entityId: memberId, details: { teamId, from: target.role, to: role } } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return this.getTeam(userId, teamId);
  }

  async removeMember(userId: string, teamId: string, memberId: string): Promise<boolean> {
    return this.prisma.$transaction(async (transaction) => {
      const actor = await transaction.teamMember.findUnique({
        where: { teamId_userId: { teamId, userId } },
        select: { id: true, role: true }
      });
      if (!actor) {
        throw new ApiError(404, 'TEAM_NOT_FOUND', 'The team was not found.');
      }

      const target = await transaction.teamMember.findFirst({
        where: { id: memberId, teamId },
        select: { id: true, userId: true, role: true }
      });
      if (!target) return false;
      if (target.role === TeamMemberRole.OWNER) {
        throw new ApiError(403, 'OWNER_PROTECTED', 'The team owner cannot be removed.');
      }

      const isSelfRemoval = target.userId === userId;
      if (!isSelfRemoval && !isManager(actor.role)) {
        throw new ApiError(403, 'FORBIDDEN', 'Your team role does not allow removing members.');
      }
      if (
        !isSelfRemoval &&
        actor.role === TeamMemberRole.ADMIN &&
        target.role === TeamMemberRole.ADMIN
      ) {
        throw new ApiError(403, 'FORBIDDEN', 'Administrators cannot remove other administrators.');
      }

      const deleted = await transaction.teamMember.deleteMany({
        where: { id: memberId, teamId, role: { not: TeamMemberRole.OWNER } }
      });
      if (deleted.count) await transaction.activityLog.create({ data: { userId, action: isSelfRemoval ? 'team.left' : 'team.member_removed', entityType: 'TeamMember', entityId: memberId, details: { teamId } } });
      return deleted.count > 0;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}
