import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@accesslens-ai/database';
import { PrismaFindingRepository } from '../services/prisma-finding.repository.js';

function findingRow(teamId: string | null = null) {
  return {
    id: 'finding-1', scanId: 'scan-1', ruleId: 'image-alt', title: 'Images need alt text',
    description: 'Add a text alternative.', impact: 'serious', severity: 'SERIOUS', status: 'OPEN',
    assignedToId: null, selector: 'img', snippet: '<img>', pageUrl: 'https://site.example/',
    wcag: 'wcag21aa, wcag111', wcagTags: ['wcag21aa', 'wcag111'], helpUrl: null,
    failureSummary: null, violationCount: 1, createdAt: new Date(), updatedAt: new Date(),
    scan: { id: 'scan-1', status: 'COMPLETED', score: 90, requestedPaths: ['/'], project: {
      id: 'project-1', name: 'Site', ownerId: 'owner-1', teamId,
      team: teamId ? { id: teamId, name: 'Team' } : null
    } },
    assignedTo: null, verificationRuns: []
  };
}

describe('PrismaFindingRepository', () => {
  it('applies current-user project scope, filters, stable sort and pagination', async () => {
    const row = findingRow('team-1');
    const findMany = vi.fn(async () => [row]);
    const count = vi.fn(async () => 1);
    const prisma = {
      finding: { findMany, count },
      teamMember: { findUnique: vi.fn(async () => ({ role: 'VIEWER' })) },
      $transaction: vi.fn(async (operations: Promise<unknown>[]) => Promise.all(operations))
    } as unknown as PrismaClient;
    const repository = new PrismaFindingRepository(prisma);

    const result = await repository.list('reader-1', {
      page: 3, pageSize: 10, projectId: 'project-1', scanId: 'scan-1', severity: 'SERIOUS',
      status: 'OPEN', wcag: '2.1 AA', search: 'image-alt', sortBy: 'severity', sortOrder: 'asc'
    });

    expect(result).toMatchObject({ total: 1, items: [{ id: 'finding-1', access: { writable: false } }] });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      skip: 20, take: 10, orderBy: { severity: 'asc' },
      where: expect.objectContaining({
        severity: 'SERIOUS', status: 'OPEN',
        scan: expect.objectContaining({ id: 'scan-1', project: expect.objectContaining({ id: 'project-1', OR: [
          { ownerId: 'reader-1', teamId: null },
          { team: { members: { some: { userId: 'reader-1' } } } }
        ] }) })
      })
    }));
    expect(count).toHaveBeenCalledOnce();
  });

  it('writes status-change audit metadata in the same transaction as the update', async () => {
    const activityCreate = vi.fn(async () => ({}));
    const update = vi.fn(async () => ({}));
    const transaction = {
      finding: { update },
      activityLog: { create: activityCreate }
    };
    const findFirst = vi.fn().mockResolvedValueOnce({ id: 'finding-1' }).mockResolvedValueOnce(findingRow());
    const prisma = {
      finding: { findFirst },
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<void>) => callback(transaction))
    } as unknown as PrismaClient;
    const repository = new PrismaFindingRepository(prisma);

    await repository.updateStatus('actor-1', 'finding-1', 'IN_REVIEW');

    expect(update).toHaveBeenCalledWith({ where: { id: 'finding-1' }, data: { status: 'IN_REVIEW' } });
    expect(activityCreate).toHaveBeenCalledWith({ data: {
      userId: 'actor-1', action: 'finding.status_changed', entityType: 'Finding',
      entityId: 'finding-1', details: { status: 'IN_REVIEW' }
    } });
  });

  it('refuses assignment to a non-member of the finding team without writing activity', async () => {
    const activityCreate = vi.fn(async () => ({}));
    const update = vi.fn(async () => ({}));
    const transaction = {
      finding: { findFirst: vi.fn(async () => ({ id: 'finding-1', scan: { project: { teamId: 'team-1' } } })), update },
      teamMember: { findUnique: vi.fn(async () => null) },
      activityLog: { create: activityCreate }
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction))
    } as unknown as PrismaClient;
    const repository = new PrismaFindingRepository(prisma);

    await expect(repository.assign('actor-1', 'finding-1', 'outsider-1')).resolves.toBeNull();
    expect(update).not.toHaveBeenCalled();
    expect(activityCreate).not.toHaveBeenCalled();
  });
});
