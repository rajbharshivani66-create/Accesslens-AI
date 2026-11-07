import { describe, expect, it } from 'vitest';
import type { ScanFindingInput } from '../modules/scans/scan.types.js';
import { compareVerification, isVerificationPage } from '../modules/findings/verification.js';

const finding = (ruleId: string, pageUrl = 'https://site.example/a', violationCount = 1): ScanFindingInput => ({
  title: ruleId, ruleId, description: '', impact: 'serious', severity: 'SERIOUS', selector: null,
  snippet: null, pageUrl, wcag: null, wcagTags: [], helpUrl: null, failureSummary: null, violationCount
});

describe('fix verification comparison', () => {
  const target = { ruleId: 'image-alt', pageUrl: 'https://site.example/a', violationCount: 2 };
  it('marks a targeted rule resolved only when absent from the rescanned page', () => {
    expect(compareVerification(target, [target], []).outcome).toBe('RESOLVED');
  });
  it('keeps an issue remaining when the same rule and page still report it', () => {
    const result = compareVerification(target, [target], [finding('image-alt', undefined, 1)]);
    expect(result).toMatchObject({ outcome: 'REMAINING', resolvedCount: 0, regressionCount: 0 });
  });
  it('detects increased affected elements and newly introduced rules', () => {
    const result = compareVerification(target, [target], [finding('image-alt', undefined, 3), finding('button-name')]);
    expect(result.outcome).toBe('REGRESSED');
    expect(result.regressionCount).toBe(2);
    expect(result.regressions.map((item) => item.ruleId)).toEqual(['button-name']);
  });
  it('does not match a rule on another page or origin', () => {
    expect(compareVerification(target, [target], [finding('image-alt', 'https://site.example/b')]).outcome).toBe('RESOLVED');
  });
  it('fails closed when the target page URL is missing or invalid', () => {
    expect(compareVerification({ ...target, pageUrl: null }, [target], []).outcome).toBe('REMAINING');
    expect(compareVerification({ ...target, pageUrl: 'javascript:alert(1)' }, [target], []).outcome).toBe('REMAINING');
  });
  it('matches verification pages by HTTP origin and path while ignoring query and fragment', () => {
    expect(isVerificationPage('https://site.example/a?token=secret#top', 'https://site.example/a')).toBe(true);
    expect(isVerificationPage('https://other.example/a', 'https://site.example/a')).toBe(false);
    expect(isVerificationPage('javascript:alert(1)', 'https://site.example/a')).toBe(false);
  });
});
