import type { FindingSeverity, FindingStatus, ScanStatus } from '@accesslens-ai/database';

export type DashboardRange = '7d' | '30d' | '90d';

export interface DashboardSummary {
  range: DashboardRange;
  metrics: {
    projectCount: number;
    scans: {
      total: number;
      byStatus: Record<ScanStatus, number>;
    };
    findings: {
      total: number;
      byStatus: Record<FindingStatus, number>;
      bySeverity: Record<FindingSeverity, number>;
    };
    accessibilityScore: number | null;
    scoredProjectCount: number;
  };
  trends: Array<{ date: string; scans: number; findings: number }>;
  recentScans: Array<{
    id: string;
    projectName: string;
    status: ScanStatus;
    score: number;
    startedAt: Date;
    completedAt: Date | null;
    findingCount: number;
  }>;
  projectPerformance: Array<{
    id: string;
    name: string;
    url: string;
    scanCount: number;
    latestScore: number | null;
    lastScannedAt: Date | null;
  }>;
  recentActivity: Array<{
    id: string;
    action: string;
    entityType: string | null;
    entityId: string | null;
    createdAt: Date;
  }>;
}

export interface DashboardRepository {
  getSummary(
    ownerId: string,
    range: DashboardRange,
    startDate: Date
  ): Promise<DashboardSummary>;
}
