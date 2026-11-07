import {
  FindingSeverity,
  FindingStatus,
  ScanStatus,
  type PrismaClient
} from '@accesslens-ai/database';
import type {
  DashboardRange,
  DashboardRepository,
  DashboardSummary
} from '../modules/dashboard/dashboard.repository.js';

interface DailyCount {
  date: string;
  count: number;
}

interface ScoreAggregate {
  average: number | null;
  count: number;
}

const scanStatuses = [
  ScanStatus.QUEUED,
  ScanStatus.IN_PROGRESS,
  ScanStatus.COMPLETED,
  ScanStatus.FAILED
];

const findingStatuses = [
  FindingStatus.OPEN,
  FindingStatus.IN_REVIEW,
  FindingStatus.IGNORED,
  FindingStatus.RESOLVED
];

const findingSeverities = [
  FindingSeverity.CRITICAL,
  FindingSeverity.SERIOUS,
  FindingSeverity.MODERATE,
  FindingSeverity.MINOR
];

function countByEnum<T extends string>(
  values: T[],
  records: Array<{ _count: { _all: number }; [key: string]: unknown }>,
  key: string
): Record<T, number> {
  const counts = Object.fromEntries(values.map((value) => [value, 0])) as Record<T, number>;
  for (const record of records) {
    const value = record[key];
    if (typeof value === 'string' && value in counts) {
      counts[value as T] = record._count._all;
    }
  }
  return counts;
}

function toTrend(
  range: DashboardRange,
  startDate: Date,
  scans: DailyCount[],
  findings: DailyCount[]
): DashboardSummary['trends'] {
  const scanCounts = new Map(scans.map((item) => [item.date, item.count]));
  const findingCounts = new Map(findings.map((item) => [item.date, item.count]));
  const days = Number.parseInt(range, 10);
  const trend: DashboardSummary['trends'] = [];

  for (let offset = 0; offset < days; offset += 1) {
    const date = new Date(startDate);
    date.setUTCDate(startDate.getUTCDate() + offset);
    const key = date.toISOString().slice(0, 10);
    trend.push({
      date: key,
      scans: scanCounts.get(key) ?? 0,
      findings: findingCounts.get(key) ?? 0
    });
  }

  return trend;
}

export class PrismaDashboardRepository implements DashboardRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getSummary(
    ownerId: string,
    range: DashboardRange,
    startDate: Date
  ): Promise<DashboardSummary> {
    const projectScope = {
      OR: [
        { ownerId, teamId: null },
        { team: { members: { some: { userId: ownerId } } } }
      ]
    };
    const findingScope = { scan: { project: projectScope } };
    const scanScope = { project: projectScope };

    const [
      projectCount,
      scansByStatus,
      findingsByStatus,
      findingsBySeverity,
      projects,
      recentScans,
      recentActivity,
      scoreAggregate,
      scansByDay,
      findingsByDay
    ] = await Promise.all([
      this.prisma.project.count({ where: projectScope }),
      this.prisma.scan.groupBy({
        by: ['status'],
        where: scanScope,
        _count: { _all: true }
      }),
      this.prisma.finding.groupBy({
        by: ['status'],
        where: findingScope,
        _count: { _all: true }
      }),
      this.prisma.finding.groupBy({
        by: ['severity'],
        where: findingScope,
        _count: { _all: true }
      }),
      this.prisma.project.findMany({
        where: projectScope,
        orderBy: { updatedAt: 'desc' },
        take: 8,
        select: {
          id: true,
          name: true,
          url: true,
          _count: { select: { scans: true } },
          scans: {
            where: { status: ScanStatus.COMPLETED, completedAt: { not: null } },
            orderBy: [{ completedAt: 'desc' }, { id: 'desc' }],
            take: 1,
            select: { score: true, completedAt: true }
          }
        }
      }),
      this.prisma.scan.findMany({
        where: scanScope,
        orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
        take: 6,
        select: {
          id: true,
          status: true,
          score: true,
          startedAt: true,
          completedAt: true,
          project: { select: { name: true } },
          _count: { select: { findings: true } }
        }
      }),
      this.prisma.activityLog.findMany({
        where: { userId: ownerId },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: {
          id: true,
          action: true,
          entityType: true,
          entityId: true,
          createdAt: true
        }
      }),
      this.prisma.$queryRaw<ScoreAggregate[]>`
        SELECT ROUND(AVG(latest."score"))::int AS average,
               COUNT(*)::int AS count
        FROM (
          SELECT DISTINCT ON (scan."projectId") scan."projectId", scan."score"
          FROM "Scan" AS scan
          INNER JOIN "Project" AS project ON project."id" = scan."projectId"
          WHERE (
            (project."ownerId" = ${ownerId} AND project."teamId" IS NULL)
            OR EXISTS (
              SELECT 1
              FROM "TeamMember" AS team_member
              WHERE team_member."teamId" = project."teamId"
                AND team_member."userId" = ${ownerId}
            )
          )
            AND scan."status" = 'COMPLETED'
            AND scan."completedAt" IS NOT NULL
          ORDER BY scan."projectId", scan."completedAt" DESC, scan."id" DESC
        ) AS latest
      `,
      this.prisma.$queryRaw<DailyCount[]>`
        SELECT TO_CHAR(DATE_TRUNC('day', scan."startedAt" AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS date,
               COUNT(*)::int AS count
        FROM "Scan" AS scan
        INNER JOIN "Project" AS project ON project."id" = scan."projectId"
        WHERE (
          (project."ownerId" = ${ownerId} AND project."teamId" IS NULL)
          OR EXISTS (
            SELECT 1
            FROM "TeamMember" AS team_member
            WHERE team_member."teamId" = project."teamId"
              AND team_member."userId" = ${ownerId}
          )
        )
          AND scan."startedAt" >= ${startDate}
        GROUP BY 1
        ORDER BY 1
      `,
      this.prisma.$queryRaw<DailyCount[]>`
        SELECT TO_CHAR(DATE_TRUNC('day', finding."createdAt" AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS date,
               COUNT(*)::int AS count
        FROM "Finding" AS finding
        INNER JOIN "Scan" AS scan ON scan."id" = finding."scanId"
        INNER JOIN "Project" AS project ON project."id" = scan."projectId"
        WHERE (
          (project."ownerId" = ${ownerId} AND project."teamId" IS NULL)
          OR EXISTS (
            SELECT 1
            FROM "TeamMember" AS team_member
            WHERE team_member."teamId" = project."teamId"
              AND team_member."userId" = ${ownerId}
          )
        )
          AND finding."createdAt" >= ${startDate}
        GROUP BY 1
        ORDER BY 1
      `
    ]);

    const scanCounts = countByEnum(scanStatuses, scansByStatus, 'status');
    const statusCounts = countByEnum(findingStatuses, findingsByStatus, 'status');
    const severityCounts = countByEnum(findingSeverities, findingsBySeverity, 'severity');
    const scoreSummary = scoreAggregate[0];

    return {
      range,
      metrics: {
        projectCount,
        scans: {
          total: Object.values(scanCounts).reduce((sum, count) => sum + count, 0),
          byStatus: scanCounts
        },
        findings: {
          total: Object.values(statusCounts).reduce((sum, count) => sum + count, 0),
          byStatus: statusCounts,
          bySeverity: severityCounts
        },
        accessibilityScore: scoreSummary.average,
        scoredProjectCount: scoreSummary.count
      },
      trends: toTrend(range, startDate, scansByDay, findingsByDay),
      recentScans: recentScans.map((scan) => ({
        id: scan.id,
        projectName: scan.project.name,
        status: scan.status,
        score: scan.score,
        startedAt: scan.startedAt,
        completedAt: scan.completedAt,
        findingCount: scan._count.findings
      })),
      projectPerformance: projects.map((project) => ({
        id: project.id,
        name: project.name,
        url: project.url,
        scanCount: project._count.scans,
        latestScore: project.scans[0]?.score ?? null,
        lastScannedAt: project.scans[0]?.completedAt ?? null
      })),
      recentActivity
    };
  }
}
