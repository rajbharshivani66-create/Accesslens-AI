import type { ScanFindingInput } from '../scans/scan.types.js';

export type VerificationOutcome = 'RESOLVED' | 'REMAINING' | 'REGRESSED';

export interface BaselineFinding {
  ruleId: string;
  pageUrl: string | null;
  violationCount: number;
}

export interface VerificationComparison {
  outcome: VerificationOutcome;
  resolvedCount: number;
  regressionCount: number;
  regressions: ScanFindingInput[];
}

function pageKey(pageUrl: string | null): string | null {
  if (!pageUrl) return null;
  try {
    const page = new URL(pageUrl);
    if (!['http:', 'https:'].includes(page.protocol) || page.username || page.password) return null;
    return `${page.origin}\0${page.pathname}`;
  } catch { return null; }
}

export function isVerificationPage(pageUrl: string | null, targetPageUrl: string | null): boolean {
  const page = pageKey(pageUrl);
  return page !== null && page === pageKey(targetPageUrl);
}

function findingKey(ruleId: string, pageUrl: string | null): string | null {
  const page = pageKey(pageUrl);
  return page ? `${ruleId}\0${page}` : null;
}

export function compareVerification(
  target: BaselineFinding,
  baselineFindings: BaselineFinding[],
  currentFindings: ScanFindingInput[]
): VerificationComparison {
  const targetKey = findingKey(target.ruleId, target.pageUrl);
  const sameRule = targetKey ? currentFindings.filter((finding) => findingKey(finding.ruleId, finding.pageUrl) === targetKey) : [];
  const currentCount = sameRule.reduce((sum, finding) => sum + finding.violationCount, 0);
  const outcome: VerificationOutcome = !targetKey
    ? 'REMAINING'
    : sameRule.length === 0
    ? 'RESOLVED'
    : currentCount > target.violationCount ? 'REGRESSED' : 'REMAINING';

  const prior = new Set(baselineFindings.map((finding) => findingKey(finding.ruleId, finding.pageUrl)).filter((key): key is string => key !== null));
  const regressions = new Map<string, ScanFindingInput>();
  for (const finding of currentFindings) {
    const key = findingKey(finding.ruleId, finding.pageUrl);
    if (key && !prior.has(key)) regressions.set(key, finding);
  }
  return {
    outcome,
    resolvedCount: outcome === 'RESOLVED' ? 1 : 0,
    regressionCount: (outcome === 'REGRESSED' ? 1 : 0) + regressions.size,
    regressions: [...regressions.values()]
  };
}
