import { FindingSeverity, type Prisma, type PrismaClient } from '@accesslens-ai/database';
import type { AnalyticsRange, AnalyticsRepository, AnalyticsSummary } from '../modules/analytics/analytics.repository.js';
import { analyticsStartDate, buildAnalyticsTrend } from '../modules/analytics/analytics.logic.js';

type Daily = { date: string; count: number };
type ProjectAggregate = { id: string; name: string; scans: number; findings: number; critical: number; serious: number; moderate: number; minor: number };
type WcagAggregate = { category: string; count: number };
const severityValues = [FindingSeverity.CRITICAL, FindingSeverity.SERIOUS, FindingSeverity.MODERATE, FindingSeverity.MINOR];
const visibleProject = (userId: string, projectId?: string): Prisma.ProjectWhereInput => ({
  ...(projectId ? { id: projectId } : {}),
  OR: [{ ownerId: userId, teamId: null }, { team: { members: { some: { userId } } } }]
});
export class PrismaAnalyticsRepository implements AnalyticsRepository {
  constructor(private readonly prisma: PrismaClient) {}
  async summarize(userId: string, range: AnalyticsRange, projectId?: string, now = new Date()): Promise<AnalyticsSummary | null> {
    const startDate = analyticsStartDate(range, now); const endDate = now;
    const projectWhere = visibleProject(userId, projectId);
    if (projectId && !await this.prisma.project.findFirst({ where: projectWhere, select: { id: true } })) return null;
    const scanWhere: Prisma.ScanWhereInput = { project: projectWhere, startedAt: { gte: startDate, lt: endDate } };
    const findingWhere: Prisma.FindingWhereInput = { scan: { project: projectWhere }, createdAt: { gte: startDate, lt: endDate } };
    const [scanCount, findingCount, severityGroups, projects, scansByDay, findingsByDay, wcagGroups] = await Promise.all([
      this.prisma.scan.count({ where: scanWhere }),
      this.prisma.finding.count({ where: findingWhere }),
      this.prisma.finding.groupBy({ by: ['severity'], where: findingWhere, _count: { _all: true } }),
      this.prisma.$queryRaw<ProjectAggregate[]>`
        SELECT p.id, p.name,
          COUNT(DISTINCT s.id) FILTER (WHERE s."startedAt" >= ${startDate} AND s."startedAt" < ${endDate})::int AS scans,
          COUNT(f.id)::int AS findings,
          COUNT(f.id) FILTER (WHERE f.severity = 'CRITICAL')::int AS critical,
          COUNT(f.id) FILTER (WHERE f.severity = 'SERIOUS')::int AS serious,
          COUNT(f.id) FILTER (WHERE f.severity = 'MODERATE')::int AS moderate,
          COUNT(f.id) FILTER (WHERE f.severity = 'MINOR')::int AS minor
        FROM "Project" p LEFT JOIN "Scan" s ON s."projectId" = p.id
        LEFT JOIN "Finding" f ON f."scanId" = s.id AND f."createdAt" >= ${startDate} AND f."createdAt" < ${endDate}
        WHERE ((p."ownerId" = ${userId} AND p."teamId" IS NULL) OR EXISTS (SELECT 1 FROM "TeamMember" tm WHERE tm."teamId" = p."teamId" AND tm."userId" = ${userId}))
          AND (${projectId ?? null}::text IS NULL OR p.id = ${projectId ?? null})
        GROUP BY p.id, p.name ORDER BY p.name LIMIT 500` ,
      this.prisma.$queryRaw<Daily[]>`
        SELECT TO_CHAR(DATE_TRUNC('day', s."startedAt" AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS date, COUNT(*)::int AS count
        FROM "Scan" s JOIN "Project" p ON p.id = s."projectId"
        WHERE ((p."ownerId" = ${userId} AND p."teamId" IS NULL) OR EXISTS (SELECT 1 FROM "TeamMember" tm WHERE tm."teamId" = p."teamId" AND tm."userId" = ${userId}))
          AND (${projectId ?? null}::text IS NULL OR p.id = ${projectId ?? null}) AND s."startedAt" >= ${startDate} AND s."startedAt" < ${endDate}
        GROUP BY 1 ORDER BY 1`,
      this.prisma.$queryRaw<Daily[]>`
        SELECT TO_CHAR(DATE_TRUNC('day', f."createdAt" AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS date, COUNT(*)::int AS count
        FROM "Finding" f JOIN "Scan" s ON s.id = f."scanId" JOIN "Project" p ON p.id = s."projectId"
        WHERE ((p."ownerId" = ${userId} AND p."teamId" IS NULL) OR EXISTS (SELECT 1 FROM "TeamMember" tm WHERE tm."teamId" = p."teamId" AND tm."userId" = ${userId}))
          AND (${projectId ?? null}::text IS NULL OR p.id = ${projectId ?? null}) AND f."createdAt" >= ${startDate} AND f."createdAt" < ${endDate}
        GROUP BY 1 ORDER BY 1`,
      this.prisma.$queryRaw<WcagAggregate[]>`
        SELECT CASE
          WHEN array_to_string(f."wcagTags", ' ') ~ 'wcag22' THEN 'WCAG 2.2'
          WHEN array_to_string(f."wcagTags", ' ') ~ 'wcag21' THEN 'WCAG 2.1'
          WHEN array_to_string(f."wcagTags", ' ') ~ 'wcag2' THEN 'WCAG 2.0'
          WHEN array_to_string(f."wcagTags", ' ') ~ 'wcag' THEN 'WCAG criteria'
          ELSE 'Unmapped' END AS category, COUNT(*)::int AS count
        FROM "Finding" f JOIN "Scan" s ON s.id = f."scanId" JOIN "Project" p ON p.id = s."projectId"
        WHERE ((p."ownerId" = ${userId} AND p."teamId" IS NULL) OR EXISTS (SELECT 1 FROM "TeamMember" tm WHERE tm."teamId" = p."teamId" AND tm."userId" = ${userId}))
          AND (${projectId ?? null}::text IS NULL OR p.id = ${projectId ?? null}) AND f."createdAt" >= ${startDate} AND f."createdAt" < ${endDate}
        GROUP BY 1 ORDER BY 1`
    ]);
    const severity = severityValues.map((value) => ({ severity: value, count: severityGroups.find((item) => item.severity === value)?._count._all ?? 0 }));
    return {
      range, startDate, endDate, projectId: projectId ?? null, totals: { scans: scanCount, findings: findingCount }, severity,
      wcag: wcagGroups,
      trends: buildAnalyticsTrend(range, startDate, scansByDay, findingsByDay),
      projects
    };
  }
}
