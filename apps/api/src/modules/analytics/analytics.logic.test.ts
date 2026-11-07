import { describe, expect, it } from 'vitest';
import { analyticsStartDate, buildAnalyticsTrend } from './analytics.logic.js';
describe('analytics range calculations', () => {
  it('uses inclusive UTC calendar days and handles month/year boundaries', () => {
    expect(analyticsStartDate('7d', new Date('2025-01-03T12:30:00Z')).toISOString()).toBe('2024-12-28T00:00:00.000Z');
  });
  it('fills missing trend days with zeroes', () => {
    expect(buildAnalyticsTrend('7d', new Date('2025-01-01T00:00:00Z'), [{ date: '2025-01-02', count: 2 }], []).map((item) => item.scans)).toEqual([0, 2, 0, 0, 0, 0, 0]);
  });
});
