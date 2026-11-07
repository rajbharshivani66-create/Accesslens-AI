import { Prisma, TeamMemberRole, type PrismaClient } from '@accesslens-ai/database';
import type { AIFindingContext, AIFixOutput, AIFixRepository } from '../modules/ai-fixes/ai-fixes.service.js';

const writableRoles: TeamMemberRole[] = [TeamMemberRole.OWNER, TeamMemberRole.ADMIN, TeamMemberRole.DEVELOPER];
function writableProject(userId: string): Prisma.ProjectWhereInput {
  return { OR: [{ ownerId: userId, teamId: null }, { team: { members: { some: { userId, role: { in: writableRoles } } } } }] };
}
const findingScope = (userId: string, findingId?: string): Prisma.FindingWhereInput => ({
  ...(findingId ? { id: findingId } : {}),
  scan: { project: writableProject(userId) }
});

export class PrismaAIFixRepository implements AIFixRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getWritableFinding(userId: string, findingId: string): Promise<AIFindingContext | null> {
    return this.prisma.finding.findFirst({
      where: findingScope(userId, findingId),
      select: {
        id: true, ruleId: true, title: true, description: true, severity: true, impact: true,
        wcag: true, wcagTags: true, failureSummary: true, snippet: true, selector: true, pageUrl: true
      }
    });
  }

  async save(userId: string, findingId: string, output: AIFixOutput) {
    return this.prisma.$transaction(async (transaction) => {
      const finding = await transaction.finding.findFirst({ where: findingScope(userId, findingId), select: { id: true } });
      if (!finding) return null;
      const explanation = await transaction.aIExplanation.upsert({
        where: { findingId },
        create: {
          findingId,
          summary: output.summary,
          detail: output.detail,
          affectedUsers: output.affectedUsers,
          wcag: output.wcag,
          fixSteps: output.fixSteps,
          rootCause: output.rootCause,
          wcagExplanation: output.wcagExplanation,
          testInstructions: output.testInstructions
        },
        update: {
          summary: output.summary,
          detail: output.detail,
          affectedUsers: output.affectedUsers,
          wcag: output.wcag,
          fixSteps: output.fixSteps,
          rootCause: output.rootCause,
          wcagExplanation: output.wcagExplanation,
          testInstructions: output.testInstructions
        }
      });
      const suggestion = await transaction.fixSuggestion.upsert({
        where: { findingId },
        create: { findingId, before: output.before, after: output.after, explanation: output.explanation, htmlSuggestion: output.htmlSuggestion, jsxSuggestion: output.jsxSuggestion },
        update: { before: output.before, after: output.after, explanation: output.explanation, htmlSuggestion: output.htmlSuggestion, jsxSuggestion: output.jsxSuggestion }
      });
      await transaction.activityLog.create({ data: { userId, action: 'finding.ai_assistance_generated', entityType: 'Finding', entityId: findingId } });
      return { findingId, explanation, suggestion };
    });
  }

  async list(userId: string) {
    const rows = await this.prisma.finding.findMany({
      where: {
        ...findingScope(userId),
        OR: [{ aiExplanation: { isNot: null } }, { fixSuggestion: { isNot: null } }]
      },
      include: {
        scan: { select: { project: { select: { id: true, name: true } } } },
        aiExplanation: true,
        fixSuggestion: true
      },
      orderBy: { updatedAt: 'desc' },
      take: 100
    });
    return rows.map((row) => ({
      findingId: row.id,
      title: row.title,
      ruleId: row.ruleId,
      severity: row.severity,
      pageUrl: row.pageUrl,
      project: row.scan.project,
      explanation: row.aiExplanation,
      suggestion: row.fixSuggestion
    }));
  }
}
