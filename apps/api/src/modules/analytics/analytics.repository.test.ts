import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@accesslens-ai/database';
import { PrismaAnalyticsRepository } from '../../services/prisma-analytics.repository.js';

describe('Prisma analytics authorization and aggregation', () => {
  it('filters aggregates by the authenticated profile, date bounds, and selected project', async () => {
    const rawCalls: Array<{ sql: string; values: unknown[] }> = [];
    const prisma = {
      project: { findFirst: vi.fn(async () => ({ id: 'project-a' })) },
      scan: { count: vi.fn(async () => 1) },
      finding: {
        count: vi.fn(async () => 2),
        groupBy: vi.fn(async () => [{ severity: 'CRITICAL', _count: { _all: 2 } }])
      },
      $queryRaw: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const sql = strings.join('?'); rawCalls.push({ sql, values });
        if (sql.includes('DATE_TRUNC') && sql.includes('"Scan"')) return [{ date: '2025-01-01', count: 1 }];
        if (sql.includes('DATE_TRUNC') && sql.includes('"Finding"')) return [{ date: '2025-01-01', count: 2 }];
        if (sql.includes('CASE')) return [{ category: 'WCAG 2.1', count: 2 }];
        return [{ id: 'project-a', name: 'A', scans: 1, findings: 2, critical: 2, serious: 0, moderate: 0, minor: 0 }];
      })
    } as unknown as PrismaClient;
    const repository = new PrismaAnalyticsRepository(prisma);
    const result = await repository.summarize('profile-a', '7d', 'project-a', new Date('2025-01-07T12:00:00Z'));
    expect(result?.totals).toEqual({ scans: 1, findings: 2 });
    expect(result?.trends).toHaveLength(7);
    expect(result?.wcag).toEqual([{ category: 'WCAG 2.1', count: 2 }]);
    expect((prisma.scan.count as ReturnType<typeof vi.fn>).mock.calls[0]?.[0].where.project.OR).toEqual([
      { ownerId: 'profile-a', teamId: null }, { team: { members: { some: { userId: 'profile-a' } } } }
    ]);
    expect(rawCalls.every(({ values }) => values.includes('profile-a') && values.includes('project-a'))).toBe(true);
    expect(result?.startDate.toISOString()).toBe('2025-01-01T00:00:00.000Z');
  });

  it('does not query aggregates for a project the caller cannot access', async () => {
    const findFirst = vi.fn(async () => null); const count = vi.fn();
    const prisma = { project: { findFirst }, scan: { count }, finding: { count, groupBy: vi.fn() }, $queryRaw: vi.fn() } as unknown as PrismaClient;
    const result = await new PrismaAnalyticsRepository(prisma).summarize('profile-a', '30d', 'foreign-project');
    expect(result).toBeNull(); expect(count).not.toHaveBeenCalled();
  });
});
