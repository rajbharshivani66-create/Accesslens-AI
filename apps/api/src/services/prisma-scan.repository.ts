import { Prisma, ScanStatus, TeamMemberRole, VerificationOutcome, VerificationStatus, type PrismaClient } from '@accesslens-ai/database';
import type { ScanOutput, ScanRepository, ScanSummary, ScanWithProject } from '../modules/scans/scan.types.js';
import { scoreAccessibility } from '../modules/scans/playwright-axe-scanner.js';
import { compareVerification, isVerificationPage } from '../modules/findings/verification.js';

const scanRoles = [TeamMemberRole.OWNER, TeamMemberRole.ADMIN, TeamMemberRole.DEVELOPER];

function projectReadWhere(userId: string): Prisma.ProjectWhereInput {
  return {
    OR: [
      { ownerId: userId, teamId: null },
      { team: { members: { some: { userId } } } }
    ]
  };
}

function projectScanWhere(userId: string): Prisma.ProjectWhereInput {
  return {
    OR: [
      { ownerId: userId, teamId: null },
      { team: { members: { some: { userId, role: { in: scanRoles } } } } }
    ]
  };
}

function scanWhere(userId: string, scanId?: string): Prisma.ScanWhereInput {
  return {
    ...(scanId ? { id: scanId } : {}),
    project: projectReadWhere(userId)
  };
}

function toSummary(scan: {
  id: string;
  projectId: string;
  status: ScanStatus;
  score: number;
  startedAt: Date;
  completedAt: Date | null;
  errorMessage: string | null;
  pageCount: number;
  incompleteCount: number;
  passedCount: number;
  durationMs: number | null;
  requestedPaths: string[];
  createdAt: Date;
  _count: { findings: number };
}): ScanSummary {
  return {
    id: scan.id,
    projectId: scan.projectId,
    status: scan.status,
    score: scan.score,
    startedAt: scan.startedAt,
    completedAt: scan.completedAt,
    errorMessage: scan.errorMessage,
    pageCount: scan.pageCount,
    incompleteCount: scan.incompleteCount,
    passedCount: scan.passedCount,
    durationMs: scan.durationMs,
    paths: scan.requestedPaths,
    findingCount: scan._count.findings,
    createdAt: scan.createdAt
  };
}

const summarySelect = {
  id: true,
  projectId: true,
  status: true,
  score: true,
  startedAt: true,
  completedAt: true,
  errorMessage: true,
  pageCount: true,
  incompleteCount: true,
  passedCount: true,
  durationMs: true,
  requestedPaths: true,
  createdAt: true,
  requestedById: true,
  verificationForFindingId: true,
  _count: { select: { findings: true } }
} satisfies Prisma.ScanSelect;

export class PrismaScanRepository implements ScanRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createScan(userId: string, projectId: string, paths: string[]): Promise<ScanSummary | null> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, ...projectScanWhere(userId) },
      select: { id: true }
    });
    if (!project) return null;

    const scan = await this.prisma.scan.create({
      data: {
        projectId,
        requestedById: userId,
        status: ScanStatus.QUEUED,
        pageCount: paths.length,
        requestedPaths: paths
      },
      select: summarySelect
    });
    return toSummary(scan);
  }

  async claimNextScan(): Promise<ScanWithProject | null> {
    const queued = await this.prisma.scan.findFirst({
      where: { status: ScanStatus.QUEUED },
      orderBy: { createdAt: 'asc' },
      select: { id: true, projectId: true, requestedById: true, verificationForFindingId: true }
    });
    if (!queued) return null;

    const fail = async () => {
      await this.prisma.$transaction([
        this.prisma.scan.updateMany({
          where: { id: queued.id, status: ScanStatus.QUEUED },
          data: {
            status: ScanStatus.FAILED,
            completedAt: new Date(),
            errorMessage: 'The scan request is no longer authorized.'
          }
        }),
        this.prisma.verificationRun.updateMany({
          where: { scanId: queued.id, status: VerificationStatus.QUEUED },
          data: { status: VerificationStatus.FAILED }
        })
      ]);
    };
    if (!queued.requestedById) {
      await fail();
      return null;
    }

    const project = await this.prisma.project.findFirst({
      where: { id: queued.projectId, ...projectScanWhere(queued.requestedById) },
      select: { id: true, url: true }
    });
    if (!project) {
      await fail();
      return null;
    }

    const claimed = await this.prisma.scan.updateMany({
      where: { id: queued.id, status: ScanStatus.QUEUED },
      data: { status: ScanStatus.IN_PROGRESS, startedAt: new Date() }
    });
    if (claimed.count !== 1) return null;

    const scan = await this.prisma.scan.findUnique({ where: { id: queued.id, status: ScanStatus.IN_PROGRESS }, select: summarySelect });
    if (queued.verificationForFindingId) {
      await this.prisma.verificationRun.updateMany({
        where: { scanId: queued.id, status: VerificationStatus.QUEUED },
        data: { status: VerificationStatus.IN_PROGRESS }
      });
    }
    return scan ? { ...toSummary(scan), projectUrl: project.url, requestedById: queued.requestedById, verificationForFindingId: queued.verificationForFindingId } : null;
  }

  async failStaleScans(startedBefore: Date): Promise<number> {
    const result = await this.prisma.scan.updateMany({
      where: {
        status: ScanStatus.IN_PROGRESS,
        requestedById: { not: null },
        startedAt: { lt: startedBefore }
      },
      data: {
        status: ScanStatus.FAILED,
        completedAt: new Date(),
        errorMessage: 'The scan worker stopped before this scan completed. Retry the scan.'
      }
    });
    await this.prisma.verificationRun.updateMany({
      where: { status: VerificationStatus.IN_PROGRESS, scan: { status: ScanStatus.FAILED, startedAt: { lt: startedBefore } } },
      data: { status: VerificationStatus.FAILED }
    });
    return result.count;
  }

  async listProjectScans(
    userId: string,
    projectId: string,
    skip: number,
    take: number
  ): Promise<{ items: ScanSummary[]; total: number } | null> {
    const projectExists = await this.prisma.project.findFirst({
      where: { id: projectId, ...projectReadWhere(userId) },
      select: { id: true }
    });
    if (!projectExists) return null;

    const where = { projectId, project: projectReadWhere(userId) } satisfies Prisma.ScanWhereInput;
    const [scans, total] = await this.prisma.$transaction([
      this.prisma.scan.findMany({ where, select: summarySelect, orderBy: { createdAt: 'desc' }, skip, take }),
      this.prisma.scan.count({ where })
    ]);
    return { items: scans.map(toSummary), total };
  }

  async listScans(userId: string, skip: number, take: number) {
    const where = { project: projectReadWhere(userId) } satisfies Prisma.ScanWhereInput;
    const [scans, total] = await this.prisma.$transaction([
      this.prisma.scan.findMany({ where, select: summarySelect, orderBy: { createdAt: 'desc' }, skip, take }),
      this.prisma.scan.count({ where })
    ]);
    return { items: scans.map(toSummary), total };
  }

  async getScan(userId: string, scanId: string) {
    const scan = await this.prisma.scan.findFirst({
      where: scanWhere(userId, scanId),
      include: { findings: { orderBy: { createdAt: 'asc' } }, pages: { orderBy: [{ createdAt: 'asc' }, { requestedUrl: 'asc' }] } }
    });
    if (!scan) return null;
    return {
      id: scan.id,
      projectId: scan.projectId,
      status: scan.status,
      score: scan.score,
      startedAt: scan.startedAt,
      completedAt: scan.completedAt,
      errorMessage: scan.errorMessage,
      pageCount: scan.pageCount,
      incompleteCount: scan.incompleteCount,
      passedCount: scan.passedCount,
      durationMs: scan.durationMs,
      paths: scan.requestedPaths,
      findingCount: scan.findings.length,
      createdAt: scan.createdAt,
      pages: scan.pages,
      findings: scan.findings.map((finding) => ({
        title: finding.title,
        ruleId: finding.ruleId,
        description: finding.description ?? '',
        impact: finding.impact,
        severity: finding.severity,
        selector: finding.selector,
        snippet: finding.snippet,
        pageUrl: finding.pageUrl ?? '',
        wcag: finding.wcag,
        wcagTags: finding.wcagTags,
        helpUrl: finding.helpUrl,
        failureSummary: finding.failureSummary,
        violationCount: finding.violationCount,
        id: finding.id,
        status: finding.status,
        createdAt: finding.createdAt
      }))
    };
  }

  async completeScan(scanId: string, result: ScanOutput): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const verificationScan = await transaction.scan.findUnique({
        where: { id: scanId },
        include: { requestedBy: { select: { id: true } }, project: { select: { name: true } }, verificationFor: { include: { scan: { include: { findings: true } } } } }
      });
      if (result.findings.length > 0) {
        await transaction.finding.createMany({
          data: result.findings.map((finding) => ({ scanId, ...finding }))
        });
      }
      if (result.pages?.length) {
        await transaction.scanPage.createMany({ data: result.pages.map((page) => ({ scanId, ...page })) });
      }
      await transaction.scan.update({
        where: { id: scanId },
        data: {
          status: ScanStatus.COMPLETED,
          completedAt: new Date(),
          errorMessage: null,
          pageCount: result.pageCount,
          incompleteCount: result.incompleteCount,
          passedCount: result.passedCount ?? 0,
          durationMs: result.durationMs ?? null,
          score: scoreAccessibility(result.findings)
        }
      });
      if (verificationScan?.requestedBy) {
        await transaction.notification.create({ data: {
          userId: verificationScan.requestedBy.id,
          type: verificationScan.verificationForFindingId ? 'VERIFICATION_COMPLETED' : 'SCAN_COMPLETED',
          title: verificationScan.verificationForFindingId ? 'Fix verification completed' : 'Accessibility scan completed',
          body: `${verificationScan.project.name}: ${result.findings.length} finding${result.findings.length === 1 ? '' : 's'} detected.`
        } });
        await transaction.activityLog.create({ data: {
          userId: verificationScan.requestedBy.id, action: verificationScan.verificationForFindingId ? 'scan.verification_completed' : 'scan.completed',
          entityType: 'Scan', entityId: scanId,
          details: { findingCount: result.findings.length, pageCount: result.pageCount, projectName: verificationScan.project.name }
        } });
      }
      const baseline = verificationScan?.verificationFor;
      if (baseline) {
        const comparison = compareVerification(
          baseline,
          baseline.scan.findings,
          result.findings
        );
        const baselinePageFindings = baseline.scan.findings.filter((finding) => isVerificationPage(finding.pageUrl, baseline.pageUrl));
        const currentPageFindings = result.findings.filter((finding) => isVerificationPage(finding.pageUrl, baseline.pageUrl));
        const scoreDelta = scoreAccessibility(currentPageFindings) - scoreAccessibility(baselinePageFindings);
        await transaction.verificationRun.updateMany({
          where: { scanId, findingId: baseline.id },
          data: {
            status: VerificationStatus.COMPLETED,
            outcome: comparison.outcome,
            resolvedCount: comparison.resolvedCount,
            regressionCount: comparison.regressionCount,
            scoreDelta
          }
        });
        if (comparison.regressions.length) {
          await transaction.verificationRun.createMany({ data: comparison.regressions.map((item) => ({
            scanId,
            findingId: null,
            status: VerificationStatus.COMPLETED,
            outcome: VerificationOutcome.REGRESSED,
            ruleId: item.ruleId,
            title: item.title,
            pageUrl: item.pageUrl,
            regressionCount: 1
          })) });
        }
      }
    });
  }

  async failScan(scanId: string, message: string, durationMs?: number): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.scan.update({
        where: { id: scanId },
        data: {
          status: ScanStatus.FAILED,
          completedAt: new Date(),
          errorMessage: message.slice(0, 500),
          ...(durationMs !== undefined ? { durationMs } : {})
        }
      }),
      this.prisma.verificationRun.updateMany({
        where: { scanId, status: { in: [VerificationStatus.QUEUED, VerificationStatus.IN_PROGRESS] } },
        data: { status: VerificationStatus.FAILED }
      })
    ]);
  }
}
