import type { Result } from 'axe-core';
import { describe, expect, it } from 'vitest';
import { normalizeAxeViolations, sanitizeCapturedHtml, scoreAccessibility, withPageTimeout } from '../modules/scans/playwright-axe-scanner.js';

describe('axe result normalization', () => {
  it('maps axe rule metadata to a WCAG finding and redacts form values', () => {
    const violations = [{
      id: 'image-alt',
      help: 'Images must have alternate text',
      description: 'Ensure every image has alternate text.',
      impact: 'critical',
      helpUrl: 'https://dequeuniversity.com/rules/axe/image-alt',
      tags: ['wcag2a', 'wcag111', 'cat.text-alternatives'],
      nodes: [{
        target: ['img.logo'],
        html: '<input value="do-not-store" data-token="private"><img class="logo" src="/logo.png">',
        failureSummary: 'Fix this image.'
      }]
    }] as unknown as Result[];

    const [finding] = normalizeAxeViolations(violations, 'https://public.example/');
    expect(finding).toMatchObject({
      title: 'Images must have alternate text',
      ruleId: 'image-alt',
      severity: 'CRITICAL',
      wcagTags: ['wcag2a', 'wcag111'],
      violationCount: 1
    });
    expect(finding.snippet).not.toContain('do-not-store');
    expect(finding.snippet).not.toContain('private');
  });

  it('redacts inputs, textareas, scripts, values, and data attributes from captured HTML', () => {
    const result = sanitizeCapturedHtml(
      '<div data-session="secret"><input value="private"><textarea>private text</textarea><script>secret</script></div>'
    );
    expect(result).not.toContain('secret');
    expect(result).not.toContain('private');
    expect(result).toContain('<textarea>[redacted]</textarea>');
  });

  it('uses a deterministic heuristic score based on observed violation severity and count', () => {
    const findings = normalizeAxeViolations([{
      id: 'test-rule', help: 'Example', description: 'Example', impact: 'serious', helpUrl: '',
      tags: [], nodes: [{ target: ['a'], html: '<a></a>', failureSummary: 'Fix' }, { target: ['b'], html: '<b></b>', failureSummary: 'Fix' }]
    }] as unknown as Result[], 'https://public.example/');
    expect(scoreAccessibility(findings)).toBe(90);
    expect(scoreAccessibility([])).toBe(100);
  });

  it('redacts every input attribute and rejects WCAG 2.0, 2.1, and 2.2 tags including AAA', () => {
    const [finding] = normalizeAxeViolations([{
      id: 'test-rule', help: 'Example', description: 'Example', impact: 'minor', helpUrl: '',
      tags: ['wcag2aaa', 'wcag21aaa', 'wcag22aaa', 'wcag143'], nodes: [{ target: ['input'], html: '<input type="password" value="private" aria-label="credential">', failureSummary: 'Fix input.' }]
    }] as unknown as Result[], 'https://public.example/');
    expect(finding?.wcagTags).toEqual(['wcag2aaa', 'wcag21aaa', 'wcag22aaa', 'wcag143']);
    expect(finding?.snippet).not.toContain('private');
    expect(finding?.snippet).not.toContain('credential');
  });

  it('hard-stops an axe evaluation at the page deadline', async () => {
    let closed = false;
    await expect(withPageTimeout(new Promise<void>(() => undefined), 5, () => { closed = true; })).rejects.toThrow('time limit');
    expect(closed).toBe(true);
  });
});
