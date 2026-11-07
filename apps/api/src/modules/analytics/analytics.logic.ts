import type { AnalyticsRange, AnalyticsTrend } from './analytics.repository.js';
export function analyticsStartDate(range: AnalyticsRange, now: Date): Date {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - (Number.parseInt(range, 10) - 1));
  return start;
}
export function buildAnalyticsTrend(range: AnalyticsRange, startDate: Date, scans: Array<{ date: string; count: number }>, findings: Array<{ date: string; count: number }>): AnalyticsTrend[] {
  const scanCounts = new Map(scans.map((item) => [item.date, item.count]));
  const findingCounts = new Map(findings.map((item) => [item.date, item.count]));
  return Array.from({ length: Number.parseInt(range, 10) }, (_, offset) => {
    const date = new Date(startDate); date.setUTCDate(startDate.getUTCDate() + offset); const key = date.toISOString().slice(0, 10);
    return { date: key, scans: scanCounts.get(key) ?? 0, findings: findingCounts.get(key) ?? 0 };
  });
}
export function wcagCategory(tags: string[]): string {
  const normalized = tags.map((tag) => tag.toLowerCase());
  if (normalized.some((tag) => tag.includes('wcag22'))) return 'WCAG 2.2';
  if (normalized.some((tag) => tag.includes('wcag21'))) return 'WCAG 2.1';
  if (normalized.some((tag) => tag.includes('wcag2'))) return 'WCAG 2.0';
  if (normalized.some((tag) => tag.includes('wcag'))) return 'WCAG criteria';
  return 'Unmapped';
}
