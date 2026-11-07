'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiRequest } from '@/lib/api';

interface Project {
  id: string;
  name: string;
  url: string;
  canEdit: boolean;
}

interface ScanSummary {
  id: string;
  projectId: string;
  status: 'QUEUED' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  score: number;
  startedAt: string;
  completedAt: string | null;
  errorMessage: string | null;
  pageCount: number;
  incompleteCount: number;
  passedCount: number;
  durationMs: number | null;
  createdAt: string;
  findingCount: number;
}

interface ScanPage {
  id: string; requestedUrl: string; finalUrl: string; title: string | null; status: string;
  durationMs: number; passedCount: number; incompleteCount: number; createdAt: string;
}

interface Finding {
  id: string;
  title: string;
  ruleId: string;
  description: string;
  severity: string;
  selector: string | null;
  pageUrl: string;
  wcag: string | null;
  helpUrl: string | null;
  violationCount: number;
}

interface ScanDetails extends ScanSummary {
  pages: ScanPage[];
  findings: Finding[];
}

interface ProjectScanList {
  items: ScanSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export default function ScannerPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState('');
  const [pathsText, setPathsText] = useState('/');
  const [scans, setScans] = useState<ScanSummary[]>([]);
  const [selectedScan, setSelectedScan] = useState<ScanDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiRequest<{ items: Project[] }>('/api/projects?page=1&pageSize=100')
      .then((result) => {
        setProjects(result.items);
        const firstWritable = result.items.find((project) => project.canEdit);
        setProjectId(firstWritable?.id ?? result.items[0]?.id ?? '');
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not load projects.'))
      .finally(() => setLoading(false));
  }, []);

  const refreshScans = useCallback(async (selectedProjectId = projectId) => {
    if (!selectedProjectId) {
      setScans([]);
      setSelectedScan(null);
      return;
    }
    const result = await apiRequest<ProjectScanList>(`/api/projects/${selectedProjectId}/scans?page=1&pageSize=20`);
    setScans(result.items);
  }, [projectId]);

  useEffect(() => {
    if (projectId) {
      refreshScans().catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : 'Could not load scan history.')
      );
    } else {
      setScans([]);
      setSelectedScan(null);
    }
  }, [projectId, refreshScans]);

  async function getScanDetails(scanId: string): Promise<ScanDetails | null> {
    try {
      const detail = await apiRequest<ScanDetails>(`/api/scans/${scanId}`);
      setSelectedScan(detail);
      setError('');
      return detail;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load scan results.');
      return null;
    }
  }

  async function waitForScan(scanId: string) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const detail = await getScanDetails(scanId);
      if (!detail || detail.status === 'COMPLETED' || detail.status === 'FAILED') return;
      await new Promise((resolve) => setTimeout(resolve, 6500));
    }
    setError('The scan is still running. Its latest status remains available in scan history.');
  }

  async function loadScan(scanId: string) {
    const detail = await getScanDetails(scanId);
    if (detail && (detail.status === 'QUEUED' || detail.status === 'IN_PROGRESS')) {
      void waitForScan(scanId);
    }
  }

  async function startScan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!projectId) return;
    const paths = pathsText.split(/\r?\n/).map((path) => path.trim()).filter(Boolean);
    setBusy(true);
    setError('');
    setSelectedScan(null);
    try {
      const result = await apiRequest<ScanSummary>('/api/scans', {
        method: 'POST',
        body: JSON.stringify({ projectId, paths })
      });
      setSelectedScan({ ...result, pages: [], findings: [] });
      await refreshScans(projectId);
      await waitForScan(result.id);
      await refreshScans(projectId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The scan could not be started.');
    } finally {
      setBusy(false);
    }
  }

  async function retryScan(scanId: string) {
    setBusy(true);
    setError('');
    try {
      const result = await apiRequest<ScanSummary>(`/api/scans/${scanId}/retry`, { method: 'POST' });
      setSelectedScan({ ...result, pages: [], findings: [] });
      await refreshScans(projectId);
      await waitForScan(result.id);
      await refreshScans(projectId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The scan could not be retried.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div aria-live="polite" className="loading-panel">Loading scanner…</div>;

  return (
    <section className="page-section">
      <div className="page-heading">
        <div>
          <p className="eyebrow">ACCESSIBILITY</p>
          <h1>Scanner</h1>
          <p className="muted">Run axe-core checks on project pages. Automated results cover only detectable rules and do not prove WCAG conformance.</p>
        </div>
      </div>
      {error && <div className="alert alert-error" role="alert">{error}</div>}

      {projects.length === 0 ? (
        <section className="surface-card">
          <h2>Create a project to begin</h2>
          <p className="muted">A project stores the website URL and keeps scan results scoped to its owner or team.</p>
          <Link className="button button-primary" href="/projects">Open projects</Link>
        </section>
      ) : (
        <div className="scan-layout">
          <section className="surface-card">
            <h2>Start a scan</h2>
            <form className="form-stack" onSubmit={(event) => void startScan(event)}>
              <label>
                Project
                <select onChange={(event) => setProjectId(event.target.value)} value={projectId}>
                  <option value="">Select a project</option>
                  {projects.map((project) => (
                    <option disabled={!project.canEdit} key={project.id} value={project.id}>
                      {project.name}{project.canEdit ? '' : ' (read only)'}
                    </option>
                  ))}
                </select>
              </label>
              {projects.find((project) => project.id === projectId) && <label>
                Website URL (saved project target)
                <input aria-readonly="true" readOnly type="url" value={projects.find((project) => project.id === projectId)?.url ?? ''} />
              </label>}
              {projectId && <Link className="text-link" href={`/projects/${projectId}`}>Edit project URL</Link>}
              <label>
                Page paths, one per line
                <textarea maxLength={8000} onChange={(event) => setPathsText(event.target.value)} rows={4} value={pathsText} />
              </label>
              <p className="muted">Paths must remain on the project’s exact origin. Query strings and fragments are blocked. The server caps pages, time, and network requests.</p>
              <button className="button button-primary" disabled={busy || !projectId || !projects.find((project) => project.id === projectId)?.canEdit} type="submit">
                {busy ? 'Scanning…' : 'Run accessibility scan'}
              </button>
            </form>
          </section>

          <section className="surface-card">
            <h2>Scan history</h2>
            {scans.length === 0 ? <p className="muted">No scans have been run for this project.</p> : (
              <div className="list-stack">
                {scans.map((scan) => (
                  <div className="list-row" key={scan.id}>
                    <button className="text-button" onClick={() => void loadScan(scan.id)} type="button">
                      <strong>{scan.status}</strong>
                      <span>{new Date(scan.startedAt).toLocaleString()} · {scan.findingCount} rule findings</span>
                    </button>
                    {scan.status === 'FAILED' && projects.find((project) => project.id === scan.projectId)?.canEdit && (
                      <button className="button button-secondary" disabled={busy} onClick={() => void retryScan(scan.id)} type="button">Retry</button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {selectedScan && (
            <section className="surface-card scan-results" aria-live="polite">
              <div className="section-heading-row">
                <div>
                  <h2>Scan results</h2>
                  <p className="muted">{selectedScan.status} · {selectedScan.pageCount} page(s) · heuristic score {selectedScan.score}/100</p>
                </div>
                <Link className="text-link" href="/findings">Open findings</Link>
              </div>
              {selectedScan.status === 'FAILED' && <div className="alert alert-error" role="alert">{selectedScan.errorMessage ?? 'The scan failed.'}</div>}
              {selectedScan.incompleteCount > 0 && <p className="muted">axe-core left {selectedScan.incompleteCount} item(s) for manual review.</p>}
              <p className="muted">{selectedScan.passedCount} passed checks · Requested {new Date(selectedScan.createdAt).toLocaleString()}{selectedScan.durationMs !== null ? ` · duration ${Math.ceil(selectedScan.durationMs / 1000)}s` : ''}</p>
              {selectedScan.pages.length > 0 && <section aria-label="Scanned pages" className="list-stack"><h3>Pages scanned</h3>{selectedScan.pages.map((page) => <article className="list-row" key={page.id}><div><strong>{page.title || '(Untitled page)'}</strong><p><a className="text-link" href={page.finalUrl} target="_blank" rel="noreferrer">{page.finalUrl}</a></p><p className="muted">{page.passedCount} passed · {page.incompleteCount} manual review · {Math.ceil(page.durationMs / 1000)}s</p></div></article>)}</section>}
              {selectedScan.findings.length === 0 && selectedScan.status === 'COMPLETED' && <p className="muted">No automated violations were returned for these pages.</p>}
              <div className="list-stack">
                {selectedScan.findings.map((finding) => (
                  <article className="list-row" key={finding.id}>
                    <div>
                      <strong>{finding.severity} · {finding.title}</strong>
                      <p className="muted">{finding.ruleId} · {finding.violationCount} affected element(s)</p>
                      <p>{finding.description}</p>
                      <p className="muted">{finding.wcag ?? 'No WCAG mapping returned'} · {finding.selector ?? 'Selector unavailable'}</p>
                      {finding.helpUrl && <a className="text-link" href={finding.helpUrl} rel="noreferrer" target="_blank">axe-core rule guidance</a>}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </section>
  );
}
