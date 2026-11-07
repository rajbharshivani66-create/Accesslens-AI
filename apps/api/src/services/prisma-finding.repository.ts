import { FindingSeverity, FindingStatus, Prisma, ScanStatus, TeamMemberRole, VerificationOutcome, VerificationStatus, type PrismaClient } from '@accesslens-ai/database';
import type { FindingAccess, FindingFilters, FindingItem, FindingRepository, VerificationHistoryItem } from '../modules/findings/finding.repository.js';

const writableRoles: TeamMemberRole[] = [TeamMemberRole.OWNER, TeamMemberRole.ADMIN, TeamMemberRole.DEVELOPER];

function readableProject(userId: string): Prisma.ProjectWhereInput {
  return { OR: [{ ownerId: userId, teamId: null }, { team: { members: { some: { userId } } } }] };
}

function writableProject(userId: string): Prisma.ProjectWhereInput {
  return { OR: [{ ownerId: userId, teamId: null }, { team: { members: { some: { userId, role: { in: writableRoles } } } } }] };
}

const include = {
  scan: { include: { project: { include: { team: { select: { id: true, name: true } } } } } },
  assignedTo: { select: { id: true, fullName: true, email: true } },
  verificationRuns: { where: { findingId: { not: null } }, orderBy: { createdAt: 'desc' as const }, take: 1 }
} satisfies Prisma.FindingInclude;

function mapFinding(row: Prisma.FindingGetPayload<{ include: typeof include }>, userId: string, teamRole: TeamMemberRole | null): FindingItem {
  const project = row.scan.project;
  const writable = project.teamId === null
    ? project.ownerId === userId
    : teamRole !== null && writableRoles.includes(teamRole);
  const access: FindingAccess = {
    writable,
    canResolve: row.verificationRuns[0]?.status === VerificationStatus.COMPLETED && row.verificationRuns[0]?.outcome === VerificationOutcome.RESOLVED,
    projectId: project.id,
    projectName: project.name,
    teamId: project.team?.id ?? null,
    teamName: project.team?.name ?? null,
    scanId: row.scanId,
    scanStatus: row.scan.status,
    score: row.scan.score,
    pageUrl: row.pageUrl,
    requestedPaths: row.scan.requestedPaths,
    assignee: row.assignedTo
  };
  return {
    id: row.id, ruleId: row.ruleId, title: row.title, description: row.description,
    impact: row.impact, severity: row.severity, status: row.status,
    assignedToId: row.assignedToId, selector: row.selector, snippet: row.snippet,
    pageUrl: row.pageUrl, wcag: row.wcag, wcagTags: row.wcagTags,
    helpUrl: row.helpUrl, failureSummary: row.failureSummary,
    violationCount: row.violationCount, createdAt: row.createdAt, updatedAt: row.updatedAt, access
  };
}

export class PrismaFindingRepository implements FindingRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private async roleFor(userId: string, teamId: string | null): Promise<TeamMemberRole | null> {
    if (!teamId) return null;
    const membership = await this.prisma.teamMember.findUnique({ where: { teamId_userId: { teamId, userId } }, select: { role: true } });
    return membership?.role ?? null;
  }

  async list(userId: string, filters: FindingFilters) {
    const wcagDigits = filters.wcag?.replace(/[^0-9]/g, '');
    const where: Prisma.FindingWhereInput = {
      scan: {
        ...(filters.scanId ? { id: filters.scanId } : {}),
        project: { ...readableProject(userId), ...(filters.projectId ? { id: filters.projectId } : {}) }
      },
      ...(filters.severity ? { severity: filters.severity as FindingSeverity } : {}),
      ...(filters.status ? { status: filters.status as FindingStatus } : {}),
      ...(filters.wcag ? { OR: [
        { wcag: { contains: filters.wcag, mode: 'insensitive' } },
        ...(wcagDigits ? [{ wcagTags: { has: `wcag${wcagDigits}` } }] : [])
      ] } : {}),
      ...(filters.search ? { AND: [{ OR: [
        { title: { contains: filters.search, mode: 'insensitive' } },
        { ruleId: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } }
      ] }] } : {})
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.finding.findMany({
        where,
        include,
        orderBy: { [filters.sortBy ?? 'createdAt']: filters.sortOrder ?? 'desc' },
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize
      }),
      this.prisma.finding.count({ where })
    ]);
    const items = await Promise.all(rows.map(async (row) => {
      const role = await this.roleFor(userId, row.scan.project.teamId);
      return mapFinding(row, userId, role);
    }));
    return { items, total };
  }

  async get(userId: string, findingId: string) {
    const row = await this.prisma.finding.findFirst({ where: { id: findingId, scan: { project: readableProject(userId) } }, include });
    if (!row) return null;
    const role = await this.roleFor(userId, row.scan.project.teamId);
    return mapFinding(row, userId, role);
  }

  async updateStatus(userId: string, findingId: string, status: FindingStatus) {
    const changed = await this.prisma.finding.findFirst({ where: { id: findingId, scan: { project: writableProject(userId) } }, select: { id: true } });
    if (!changed) return null;
    if (status === FindingStatus.RESOLVED) {
      const latest = await this.prisma.verificationRun.findFirst({
        where: { findingId: changed.id },
        orderBy: { createdAt: 'desc' },
        select: { status: true, outcome: true }
      });
      if (latest?.status !== VerificationStatus.COMPLETED || latest.outcome !== VerificationOutcome.RESOLVED) return null;
    }
    await this.prisma.$transaction(async (transaction) => {
      await transaction.finding.update({ where: { id: changed.id }, data: { status } });
      await transaction.activityLog.create({ data: { userId, action: 'finding.status_changed', entityType: 'Finding', entityId: changed.id, details: { status } } });
    });
    return this.get(userId, changed.id);
  }

  async assign(userId: string, findingId: string, assignedToId: string | null) {
    const updatedId = await this.prisma.$transaction(async (transaction) => {
      const row = await transaction.finding.findFirst({ where: { id: findingId, scan: { project: writableProject(userId) } }, select: { id: true, scan: { select: { project: { select: { teamId: true } } } } } });
      if (!row) return null;
      if (assignedToId) {
        if (row.scan.project.teamId) {
          const member = await transaction.teamMember.findUnique({ where: { teamId_userId: { teamId: row.scan.project.teamId, userId: assignedToId } }, select: { id: true } });
          if (!member) return null;
        } else if (assignedToId !== userId) return null;
      }
      await transaction.finding.update({ where: { id: row.id }, data: { assignedToId } });
      await transaction.activityLog.create({ data: { userId, action: 'finding.assigned', entityType: 'Finding', entityId: row.id, details: { assignedToId } } });
      return row.id;
    });
    return updatedId ? this.get(userId, updatedId) : null;
  }

  async startVerification(userId: string, findingId: string) {
    return this.prisma.$transaction(async (transaction) => {
      const finding = await transaction.finding.findFirst({
        where: { id: findingId, scan: { project: writableProject(userId) } },
        include: { scan: { include: { project: true } } }
      });
      if (!finding || !finding.pageUrl) return null;
      let target: URL;
      let projectUrl: URL;
      try { target = new URL(finding.pageUrl); projectUrl = new URL(finding.scan.project.url); }
      catch { return null; }
      if (target.origin !== projectUrl.origin) return null;
      const path = target.pathname || '/';
      const scan = await transaction.scan.create({
        data: {
          projectId: finding.scan.projectId,
          requestedById: userId,
          status: ScanStatus.QUEUED,
          pageCount: 1,
          requestedPaths: [path],
          verificationForFindingId: finding.id
        },
        select: { id: true, projectId: true, status: true }
      });
      await transaction.verificationRun.create({
        data: {
          scanId: scan.id,
          findingId: finding.id,
          status: VerificationStatus.QUEUED,
          ruleId: finding.ruleId,
          title: finding.title,
          pageUrl: target.origin + path
        }
      });
      return scan;
    });
  }

  async listVerifications(userId: string, findingId?: string): Promise<VerificationHistoryItem[]> {
    const rows = await this.prisma.verificationRun.findMany({
      where: {
        ...(findingId ? { findingId } : {}),
        scan: { project: readableProject(userId) }
      },
      include: { scan: { select: { status: true, project: { select: { id: true, name: true } } } } },
      orderBy: { createdAt: 'desc' },
      take: 100
    });
    return rows.map((row) => ({
      id: row.id, scanId: row.scanId, findingId: row.findingId, status: row.status, outcome: row.outcome,
      ruleId: row.ruleId, title: row.title, pageUrl: row.pageUrl, resolvedCount: row.resolvedCount,
      regressionCount: row.regressionCount, scoreDelta: row.scoreDelta, createdAt: row.createdAt,
      scanStatus: row.scan.status, projectId: row.scan.project.id, projectName: row.scan.project.name
    }));
  }
}
