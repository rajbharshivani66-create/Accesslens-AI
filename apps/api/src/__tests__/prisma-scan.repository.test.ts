import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@accesslens-ai/database';
import { PrismaScanRepository } from '../services/prisma-scan.repository.js';

describe('Prisma scan result persistence', () => {
  it('stores findings, per-page metadata, passed/incomplete counts, and duration transactionally', async () => {
    const scanUpdate = vi.fn(async () => ({}));
    const findingCreateMany = vi.fn(async () => ({ count: 1 }));
    const pageCreateMany = vi.fn(async () => ({ count: 1 }));
    const transaction = {
      scan: { findUnique: vi.fn(async () => ({ requestedBy: null, project: { name: 'Website' }, verificationFor: null })), update: scanUpdate },
      finding: { createMany: findingCreateMany },
      scanPage: { createMany: pageCreateMany }
    };
    const prisma = { $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<void>) => callback(transaction)) } as unknown as PrismaClient;
    const repository = new PrismaScanRepository(prisma);
    await repository.completeScan('scan-a', {
      findings: [{ title: 'Image alt', ruleId: 'image-alt', description: 'Add alt text', impact: 'critical', severity: 'CRITICAL', selector: 'img', snippet: '<img>', pageUrl: 'https://public.example/', wcag: 'wcag2a', wcagTags: ['wcag2a'], helpUrl: null, failureSummary: null, violationCount: 1 }],
      pageCount: 1, passedCount: 24, incompleteCount: 2, durationMs: 1050,
      pages: [{ requestedUrl: 'https://public.example/', finalUrl: 'https://public.example/', title: 'Public page', durationMs: 1050, passedCount: 24, incompleteCount: 2 }]
    });
    expect(findingCreateMany).toHaveBeenCalledWith({ data: [expect.objectContaining({ scanId: 'scan-a', wcagTags: ['wcag2a'] })] });
    expect(pageCreateMany).toHaveBeenCalledWith({ data: [expect.objectContaining({ scanId: 'scan-a', title: 'Public page', passedCount: 24 })] });
    expect(scanUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'COMPLETED', passedCount: 24, incompleteCount: 2, durationMs: 1050 }) }));
  });

  it('compares verification score only against findings from the same page and persists new-rule regressions', async () => {
    const verificationUpdate = vi.fn(async () => ({ count: 1 }));
    const regressionCreate = vi.fn(async () => ({ count: 1 }));
    const scanUpdate = vi.fn(async () => ({}));
    const baselinePageUrl = 'https://site.example/a';
    const transaction = {
      scan: {
        findUnique: vi.fn(async () => ({
          requestedBy: null,
          project: { name: 'Website' },
          verificationFor: {
            id: 'finding-target', ruleId: 'image-alt', title: 'Missing alt', pageUrl: baselinePageUrl, violationCount: 1,
            scan: { score: 0, findings: [
              { ruleId: 'image-alt', pageUrl: baselinePageUrl, severity: 'SERIOUS', violationCount: 1 },
              { ruleId: 'color-contrast', pageUrl: 'https://site.example/other-page', severity: 'CRITICAL', violationCount: 10 }
            ] }
          }
        })),
        update: scanUpdate
      },
      finding: { createMany: vi.fn(async () => ({ count: 1 })) },
      scanPage: { createMany: vi.fn(async () => ({ count: 1 })) },
      verificationRun: { updateMany: verificationUpdate, createMany: regressionCreate }
    };
    const prisma = { $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<void>) => callback(transaction)) } as unknown as PrismaClient;
    const repository = new PrismaScanRepository(prisma);
    await repository.completeScan('verification-scan', {
      findings: [{ title: 'New contrast issue', ruleId: 'color-contrast', description: 'Increase contrast', impact: 'moderate', severity: 'MODERATE', selector: null, snippet: null, pageUrl: baselinePageUrl, wcag: null, wcagTags: [], helpUrl: null, failureSummary: null, violationCount: 1 }],
      pageCount: 1, incompleteCount: 0, passedCount: 10, durationMs: 900
    });

    expect(verificationUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { scanId: 'verification-scan', findingId: 'finding-target' },
      data: expect.objectContaining({ outcome: 'RESOLVED', resolvedCount: 1, regressionCount: 1, scoreDelta: 3 })
    }));
    expect(regressionCreate).toHaveBeenCalledWith({ data: [expect.objectContaining({
      scanId: 'verification-scan', findingId: null, outcome: 'REGRESSED', ruleId: 'color-contrast', pageUrl: baselinePageUrl
    })] });
  });

  it('marks queued or active verification records failed when the scan worker fails', async () => {
    const scanUpdate = vi.fn(async () => ({}));
    const verificationUpdate = vi.fn(async () => ({ count: 1 }));
    const prisma = {
      $transaction: vi.fn(async (operations: Promise<unknown>[]) => Promise.all(operations)),
      scan: { update: scanUpdate },
      verificationRun: { updateMany: verificationUpdate }
    } as unknown as PrismaClient;
    const repository = new PrismaScanRepository(prisma);
    await repository.failScan('verification-scan', 'safe failure', 321);
    expect(verificationUpdate).toHaveBeenCalledWith({
      where: { scanId: 'verification-scan', status: { in: ['QUEUED', 'IN_PROGRESS'] } },
      data: { status: 'FAILED' }
    });
    expect(scanUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'verification-scan' },
      data: expect.objectContaining({ status: 'FAILED', errorMessage: 'safe failure', durationMs: 321 })
    }));
  });
});
