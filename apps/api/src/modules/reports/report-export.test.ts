import { describe, expect, it } from 'vitest';
import { findingsCsv, findingsPdf } from './report-export.js';
import type { ReportFinding } from './report.repository.js';

const row: ReportFinding = { id: 'f1', project: 'Demo', severity: 'SERIOUS', status: 'OPEN', title: '=HYPERLINK("bad")', ruleId: 'image-alt', wcag: '1.1.1', pageUrl: 'https://example.test', createdAt: new Date('2026-01-01T00:00:00Z') };
describe('report exports', () => {
  it('escapes CSV delimiters and neutralizes spreadsheet formulas', () => {
    const csv = findingsCsv([row]);
    expect(csv).toContain("'=HYPERLINK(\"\"bad\"\")");
    expect(csv).toContain('"https://example.test"');
  });
  it('returns a structurally marked PDF document', () => {
    const pdf = findingsPdf([row]).toString('ascii');
    expect(pdf.startsWith('%PDF-1.4')).toBe(true);
    expect(pdf).toContain('/Type /Catalog');
    expect(pdf.endsWith('%%EOF')).toBe(true);
  });
});
