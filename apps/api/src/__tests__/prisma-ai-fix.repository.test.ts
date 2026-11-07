import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@accesslens-ai/database';
import { PrismaAIFixRepository } from '../services/prisma-ai-fix.repository.js';
import type { AIFixOutput } from '../modules/ai-fixes/ai-fixes.service.js';

const output: AIFixOutput = {
  summary: 'Add alternative text.', detail: 'Assistive technology needs a text alternative.', affectedUsers: ['Screen reader users'],
  wcag: ['WCAG 1.1.1'], fixSteps: ['Describe the image.'], rootCause: 'The image is missing an alternative.',
  wcagExplanation: 'Non-text content needs an equivalent text alternative.', testInstructions: ['Listen using a screen reader.'],
  before: '<img>', after: '<img alt="Diagram">', htmlSuggestion: '<img src="diagram.svg" alt="Diagram">',
  jsxSuggestion: '<img src="diagram.svg" alt="Diagram" />', explanation: 'Alternative text provides an accessible name.'
};

describe('Prisma AI assistance persistence', () => {
  it('constrains lookup to writable current team roles and hides inaccessible findings', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const repository = new PrismaAIFixRepository({ finding: { findFirst } } as unknown as PrismaClient);
    expect(await repository.getWritableFinding('viewer', 'foreign')).toBeNull();
    const where = findFirst.mock.calls[0]?.[0]?.where;
    expect(where.scan.project.OR[0].ownerId).toBe('viewer');
    expect(where.scan.project.OR[1].team.members.some.userId).toBe('viewer');
    expect(where.scan.project.OR[1].team.members.some.role.in).toEqual(['OWNER', 'ADMIN', 'DEVELOPER']);
  });

  it('transactionally saves structured explanation/fix fields and an activity event', async () => {
    const explanationUpsert = vi.fn(async ({ create }: { create: unknown }) => create);
    const suggestionUpsert = vi.fn(async ({ create }: { create: unknown }) => create);
    const activityCreate = vi.fn(async () => ({}));
    const transaction = {
      finding: { findFirst: vi.fn(async () => ({ id: 'finding-1' })) },
      aIExplanation: { upsert: explanationUpsert }, fixSuggestion: { upsert: suggestionUpsert }, activityLog: { create: activityCreate }
    };
    const prisma = { $transaction: async <T>(callback: (tx: typeof transaction) => Promise<T>) => callback(transaction) };
    const repository = new PrismaAIFixRepository(prisma as unknown as PrismaClient);
    const saved = await repository.save('profile-1', 'finding-1', output);
    expect(saved).toMatchObject({ findingId: 'finding-1', explanation: { rootCause: output.rootCause, wcagExplanation: output.wcagExplanation, testInstructions: output.testInstructions }, suggestion: { htmlSuggestion: output.htmlSuggestion, jsxSuggestion: output.jsxSuggestion } });
    expect(activityCreate).toHaveBeenCalledWith({ data: { userId: 'profile-1', action: 'finding.ai_assistance_generated', entityType: 'Finding', entityId: 'finding-1' } });
  });
});
