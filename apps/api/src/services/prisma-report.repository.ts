import { Prisma, type PrismaClient } from '@accesslens-ai/database';
import type { ReportRepository } from '../modules/reports/report.repository.js';

export class PrismaReportRepository implements ReportRepository {
  constructor(private readonly prisma: PrismaClient) {}

  listFindings(userId: string, projectId?: string, take = 5000) {
    return this.prisma.finding.findMany({
      where: {
        scan: { project: {
          ...(projectId ? { id: projectId } : {}),
          OR: [ { ownerId: userId, teamId: null }, { team: { members: { some: { userId } } } } ]
        } }
      },
      include: { scan: { include: { project: { select: { name: true } } } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], take: Math.min(Math.max(take, 1), 5000)
    }).then((rows) => rows.map((row) => ({
      id: row.id, project: row.scan.project.name, severity: row.severity,
      status: row.status, title: row.title, ruleId: row.ruleId, wcag: row.wcag,
      pageUrl: row.pageUrl, createdAt: row.createdAt
    })));
  }
}
