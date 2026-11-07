export type AnalyticsRange = '7d' | '30d' | '90d';
export interface AnalyticsTrend { date: string; scans: number; findings: number }
export interface AnalyticsProject { id: string; name: string; scans: number; findings: number; critical: number; serious: number; moderate: number; minor: number }
export interface AnalyticsSummary {
  range: AnalyticsRange; startDate: Date; endDate: Date; projectId: string | null;
  totals: { scans: number; findings: number };
  severity: Array<{ severity: string; count: number }>;
  wcag: Array<{ category: string; count: number }>;
  trends: AnalyticsTrend[];
  projects: AnalyticsProject[];
}
export interface AnalyticsRepository {
  summarize(userId: string, range: AnalyticsRange, projectId?: string, now?: Date): Promise<AnalyticsSummary | null>;
}
