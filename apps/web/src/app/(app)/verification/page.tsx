'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiRequest } from '@/lib/api';

type Verification = {
  id: string; scanId: string; findingId: string | null;
  status: 'QUEUED' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  outcome: 'RESOLVED' | 'REMAINING' | 'REGRESSED' | null;
  ruleId: string | null; title: string | null; pageUrl: string | null;
  resolvedCount: number; regressionCount: number; scoreDelta: number;
  createdAt: string; scanStatus: string; projectId: string; projectName: string;
};

export default function VerificationPage() {
  const [history, setHistory] = useState<Verification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      setError('');
      setHistory(await apiRequest<Verification[]>('/api/verifications'));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load verification history.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!history.some((item) => item.status === 'QUEUED' || item.status === 'IN_PROGRESS')) return;
    const timer = window.setInterval(() => void refresh(), 4000);
    return () => window.clearInterval(timer);
  }, [history, refresh]);

  return <section className="page-stack">
    <header className="page-heading"><div><p className="eyebrow">Accessibility</p><h1>Fix verification</h1><p className="muted">Rescan the affected page and compare the targeted rule with the previous result. This is automated evidence, not a full WCAG conformance review.</p></div><button className="button button-secondary" onClick={() => void refresh()}>Refresh</button></header>
    {error && <p className="form-error" role="alert">{error}</p>}
    {loading ? <section className="panel" role="status">Loading verification history…</section> : history.length === 0 ? <section className="panel"><h2>No verification runs</h2><p className="muted">Open a finding and select “Verify fix” after changing the affected page.</p><Link className="text-link" href="/findings">Review findings</Link></section> : <section className="finding-list" aria-label="Verification history">
      {history.map((item) => <article className="panel finding-card" key={item.id}>
        <div className="finding-card-heading"><div><p className="eyebrow">{item.status} · {item.outcome ?? 'PENDING'}</p><h2>{item.title ?? item.ruleId ?? 'Verification scan'}</h2><p className="muted">{item.projectName} · {item.ruleId ?? 'Rule unavailable'} · {new Date(item.createdAt).toLocaleString()}</p></div><span className="badge">Scan {item.scanStatus}</span></div>
        <p>{item.status === 'FAILED' ? 'The verification scan failed. Retry from the original finding.' : item.outcome === 'RESOLVED' ? 'The targeted rule was not reported in the verification scan.' : item.outcome === 'REMAINING' ? 'The targeted rule remains present at a similar or lower affected-element count.' : item.outcome === 'REGRESSED' ? 'The targeted rule increased or a new rule appeared on the rescanned page.' : 'The affected page is being rescanned.'}</p>
        <p className="muted">{item.resolvedCount} resolved · {item.regressionCount} regressions · affected-page score change {item.scoreDelta > 0 ? '+' : ''}{item.scoreDelta} (heuristic)</p>
        {item.pageUrl && <p><a className="text-link" href={item.pageUrl} target="_blank" rel="noreferrer">Affected page</a></p>}
        <div className="finding-actions"><code>Scan {item.scanId}</code>{item.findingId && <Link className="text-link" href="/findings">View finding</Link>}</div>
      </article>)}
    </section>}
  </section>;
}
