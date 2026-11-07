'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiRequest } from '@/lib/api';

type FindingOption = { id: string; title: string; ruleId: string; severity: string; status: string; access: { writable: boolean; projectName: string } };
type Generated = {
  findingId: string;
  explanation: { summary: string; detail: string; rootCause: string | null; wcagExplanation: string | null; testInstructions: string[]; affectedUsers: string[]; wcag: string[]; fixSteps: string[] };
  suggestion: { before: string; after: string; htmlSuggestion: string | null; jsxSuggestion: string | null; explanation: string; status: string };
};
type Saved = { findingId: string; title: string; ruleId: string; severity: string; pageUrl: string | null; project: { name: string }; explanation: Generated['explanation'] | null; suggestion: Generated['suggestion'] | null };

export default function AIFixesPage() {
  const [findings, setFindings] = useState<FindingOption[]>([]);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [copied, setCopied] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [findingResult, savedResult] = await Promise.all([
        apiRequest<{ items: FindingOption[] }>('/api/findings?page=1&pageSize=100'),
        apiRequest<Saved[]>('/api/ai/fixes')
      ]);
      setFindings(findingResult.items.filter((item) => item.access.writable));
      setSaved(savedResult);
      setSelectedId((current) => current || findingResult.items.find((item) => item.access.writable)?.id || '');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load AI fix data.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function generate(endpoint: '/api/ai/explain' | '/api/ai/fix-suggestions') {
    if (!selectedId) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await apiRequest<Generated>(endpoint, { method: 'POST', body: JSON.stringify({ findingId: selectedId }) });
      setNotice('AI-generated explanation and suggestions saved. Developer review and testing are required.');
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'AI generation failed.'); }
    finally { setBusy(false); }
  }

  async function copySuggestion(value: string) {
    try { await navigator.clipboard.writeText(value); setCopied('Suggestion copied. Review before using it.'); }
    catch { setCopied('Copy failed. Select and copy the suggestion manually.'); }
  }

  return <section className="page-stack">
    <header className="page-heading"><div><p className="eyebrow">Assisted remediation</p><h1>AI explanations and fixes</h1><p className="muted">Gemini provides WCAG context and illustrative HTML/JSX suggestions. Review every suggestion and test it in your own codebase. Generated code is never executed or applied automatically.</p></div></header>
    {error && <p className="form-error" role="alert">{error}</p>}{notice && <p className="form-success" role="status">{notice}</p>}
    <section className="panel"><div className="form-stack">
      <label>Finding<select value={selectedId} onChange={(event) => setSelectedId(event.target.value)} disabled={loading || busy}><option value="">{loading ? 'Loading findings…' : 'Select a writable finding'}</option>{!loading && findings.length === 0 && <option disabled>{error ? 'Findings unavailable — check API connection' : 'No writable findings — create a project and run a scan'}</option>}{findings.map((finding) => <option key={finding.id} value={finding.id}>{finding.severity} · {finding.title} ({finding.access.projectName})</option>)}</select></label>
      {!loading && findings.length === 0 && <div className="finding-actions">{error && <button className="button button-secondary" onClick={() => void load()}>Retry</button>}<Link className="button button-secondary" href="/projects">Create a project</Link><Link className="button button-primary" href="/scanner">Open scanner</Link></div>}
      <div className="finding-actions"><button className="button button-primary" onClick={() => void generate('/api/ai/explain')} disabled={!selectedId || busy || loading}>{busy ? 'Generating…' : 'Explain with AI'}</button><button className="button button-secondary" onClick={() => void generate('/api/ai/fix-suggestions')} disabled={!selectedId || busy || loading}>{busy ? 'Generating…' : 'Generate fix suggestions'}</button></div>
      {copied && <p className="form-success" role="status">{copied}</p>}
      <p className="muted">Automated axe results cover only a subset of accessibility checks. A human must review WCAG criteria and test the change. AI output can be incorrect.</p>
    </div></section>
    {loading ? <section className="panel" role="status">Loading saved explanations…</section> : saved.length === 0 ? <section className="panel"><h2>No saved AI assistance</h2><p className="muted">Select a finding above to request an explanation.</p></section> : <section className="finding-list" aria-label="Saved AI explanations">
      {saved.map((item) => <article className="panel finding-card" key={item.findingId}>
        <div className="finding-card-heading"><div><p className="eyebrow">{item.severity} · {item.ruleId} · {item.project.name}</p><h2>{item.title}</h2></div></div>
        {item.explanation && <><p><strong>AI-generated explanation — review before relying on it</strong></p><p>{item.explanation.summary}</p><p>{item.explanation.detail}</p><h3>Root cause</h3><p>{item.explanation.rootCause || 'Not available'}</p><p className="muted">Potentially affected users: {item.explanation.affectedUsers.join('; ') || 'Not specified'}</p><h3>WCAG explanation</h3><p>{item.explanation.wcagExplanation || item.explanation.wcag.join('; ') || 'No specific criterion provided'}</p><h3>Recommended remediation</h3><ol>{item.explanation.fixSteps.map((step, index) => <li key={`${index}-${step}`}>{step}</li>)}</ol><h3>Testing and manual verification</h3><ul>{item.explanation.testInstructions.map((step, index) => <li key={`${index}-${step}`}>{step}</li>)}</ul></>}
        {item.suggestion && <details><summary>AI-generated code suggestions ({item.suggestion.status})</summary><p>{item.suggestion.explanation}</p><div className="code-comparison"><div><strong>Before (sanitized context)</strong><pre><code>{item.suggestion.before || 'No before example provided'}</code></pre></div><div><strong>Suggested HTML</strong><pre><code>{item.suggestion.htmlSuggestion || item.suggestion.after}</code></pre><button className="button button-secondary" onClick={() => void copySuggestion(item.suggestion!.htmlSuggestion || item.suggestion!.after)} type="button">Copy HTML suggestion</button></div><div><strong>Suggested React / JSX</strong><pre><code>{item.suggestion.jsxSuggestion || 'No JSX suggestion was saved'}</code></pre>{item.suggestion.jsxSuggestion && <button className="button button-secondary" onClick={() => void copySuggestion(item.suggestion!.jsxSuggestion!)} type="button">Copy JSX suggestion</button>}</div></div><p className="muted">Suggestion only. A developer must review and test this code. Nothing is executed or applied automatically.</p></details>}
        {item.pageUrl && <a className="text-link" href={item.pageUrl} target="_blank" rel="noreferrer">Open scanned page</a>}
      </article>)}
    </section>}
  </section>;
}
