'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { apiRequest } from '@/lib/api';
import { describeGeminiError } from '@/lib/ai-errors';

type Finding = {
  id: string; ruleId: string; title: string; description: string | null; impact: string | null;
  severity: 'CRITICAL' | 'SERIOUS' | 'MODERATE' | 'MINOR'; status: 'OPEN' | 'IN_REVIEW' | 'IGNORED' | 'RESOLVED';
  assignedToId: string | null; selector: string | null; snippet: string | null; pageUrl: string | null;
  wcag: string | null; wcagTags: string[]; helpUrl: string | null; failureSummary: string | null;
  violationCount: number; createdAt: string; updatedAt: string;
  access: { writable: boolean; canResolve: boolean; projectId: string; projectName: string; teamId: string | null; teamName: string | null; scanId: string; scanStatus: string; score: number; pageUrl: string | null; assignee: { id: string; fullName: string | null; email: string } | null };
};
type Project = { id: string; name: string };
type Profile = { id: string };
type Member = { userId: string; email: string; fullName: string | null; role: string };
type Result = { items: Finding[]; total: number; page: number; pageSize: number };
type AIAssistance = { findingId: string; explanation: { summary: string; detail: string; rootCause: string; wcagExplanation: string; testInstructions: string[]; fixSteps: string[] }; suggestion: { htmlSuggestion: string; jsxSuggestion: string; explanation: string } };
type JiraLinkedIssue = { id: string; jiraKey: string; title: string; status: string; url: string | null; findingId: string | null; lastSyncedAt: string | null };
type JiraIntegration = { id: string; baseUrl: string; projectKey: string; connectedAt: string | null; issues: JiraLinkedIssue[] };

export default function FindingsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [profileId, setProfileId] = useState('');
  const [result, setResult] = useState<Result>({ items: [], total: 0, page: 1, pageSize: 20 });
  const [query, setQuery] = useState({ projectId: '', severity: '', status: '', wcag: '', search: '', sortBy: 'createdAt', sortOrder: 'desc' });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [members, setMembers] = useState<Record<string, Member[]>>({});
  const [membersLoading, setMembersLoading] = useState<Record<string, boolean>>({});
  const [busyFindingId, setBusyFindingId] = useState('');
  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [aiAssistance, setAiAssistance] = useState<AIAssistance | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [jiraIntegrations, setJiraIntegrations] = useState<JiraIntegration[]>([]);
  const [jiraIntegrationId, setJiraIntegrationId] = useState('');
  const [jiraBusy, setJiraBusy] = useState(false);
  const [includeReviewedRemediation, setIncludeReviewedRemediation] = useState(false);
  const [jiraIssueByFinding, setJiraIssueByFinding] = useState<Record<string, JiraLinkedIssue>>({});
  const detailDialogRef = useRef<HTMLElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    apiRequest<{ items: Project[] }>('/api/projects?page=1&pageSize=100')
      .then((data) => setProjects(data.items))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Could not load projects.'));
    apiRequest<Profile>('/api/profile').then((profile) => setProfileId(profile.id)).catch(() => undefined);
    apiRequest<{ integrations: JiraIntegration[] }>('/api/jira/status')
      .then((status) => { const connected = status.integrations.filter((item) => item.connectedAt); setJiraIntegrations(connected); if (connected[0]) setJiraIntegrationId(connected[0].id); })
      .catch(() => undefined);
  }, []);

  const loadFindings = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: '20' });
      for (const [key, value] of Object.entries(query)) if (value) params.set(key, value);
      setResult(await apiRequest<Result>(`/api/findings?${params.toString()}`));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load findings.');
    } finally { setLoading(false); }
  }, [page, query]);

  useEffect(() => { void loadFindings(); }, [loadFindings]);

  useEffect(() => {
    if (!selectedFinding) return;
    const dialog = detailDialogRef.current;
    const closeButton = dialog?.querySelector<HTMLButtonElement>('[data-dialog-close]');
    closeButton?.focus();

    function handleDialogKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setSelectedFinding(null);
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )).filter((element) => element.offsetParent !== null);
      if (!focusable.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleDialogKeyDown);
    return () => {
      document.removeEventListener('keydown', handleDialogKeyDown);
      returnFocusRef.current?.focus();
    };
  }, [selectedFinding]);

  async function loadMembers(teamId: string) {
    if (members[teamId] || membersLoading[teamId]) return;
    setMembersLoading((previous) => ({ ...previous, [teamId]: true }));
    try {
      const team = await apiRequest<{ members: Member[] }>(`/api/teams/${teamId}`);
      setMembers((previous) => ({ ...previous, [teamId]: team.members }));
    } catch { setNotice('Team members could not be loaded for assignment.'); }
    finally { setMembersLoading((previous) => ({ ...previous, [teamId]: false })); }
  }

  async function updateFinding(finding: Finding, action: 'status' | 'assign', value: string) {
    setBusyFindingId(finding.id); setNotice(''); setError('');
    try {
      const updated = action === 'status'
        ? await apiRequest<Finding>(`/api/findings/${finding.id}`, { method: 'PATCH', body: JSON.stringify({ status: value }) })
        : await apiRequest<Finding>(`/api/findings/${finding.id}/assign`, { method: 'POST', body: JSON.stringify({ assignedToId: value || null }) });
      setResult((current) => ({ ...current, items: current.items.map((item) => item.id === finding.id ? updated : item) }));
      setSelectedFinding((current) => current?.id === finding.id ? updated : current);
      setNotice(action === 'status' ? 'Finding status updated.' : 'Finding assignment updated.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The update failed.'); }
    finally { setBusyFindingId(''); }
  }

  async function verifyFinding(finding: Finding) {
    setBusyFindingId(finding.id); setError(''); setNotice('');
    try {
      const scan = await apiRequest<{ id: string; status: string }>(`/api/findings/${finding.id}/verify`, { method: 'POST' });
      setNotice(`Verification scan ${scan.id} was queued (${scan.status}). See the Verification page for its result.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Verification could not be started.'); }
    finally { setBusyFindingId(''); }
  }

  async function openFinding(findingId: string) {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setDetailLoading(true);
    setSelectedFinding(null);
    setAiAssistance(null);
    setIncludeReviewedRemediation(false);
    setError('');
    try {
      setSelectedFinding(await apiRequest<Finding>(`/api/findings/${findingId}`));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load finding details.');
    } finally { setDetailLoading(false); }
  }

  async function explainFinding(findingId: string) {
    setAiBusy(true); setError(''); setNotice('');
    try {
      setAiAssistance(await apiRequest<AIAssistance>('/api/ai/explain', { method: 'POST', body: JSON.stringify({ findingId }) }));
      setNotice('AI-generated guidance loaded. Developer review is required.');
    } catch (reason) { setError(describeGeminiError(reason)); }
    finally { setAiBusy(false); }
  }

  async function copyAI(value: string) {
    try { await navigator.clipboard.writeText(value); setNotice('Suggestion copied. Review and test it before use.'); }
    catch { setError('Copy failed. Select and copy the suggestion manually.'); }
  }

  async function createJiraIssue() {
    if (!selectedFinding || !jiraIntegrationId) return;
    setJiraBusy(true); setError(''); setNotice('');
    try {
      const issue = await apiRequest<JiraLinkedIssue & { alreadyExists?: boolean }>('/api/jira/issues', { method: 'POST', body: JSON.stringify({ findingId: selectedFinding.id, integrationId: jiraIntegrationId, includeReviewedRemediation }) });
      setJiraIssueByFinding((current) => ({ ...current, [selectedFinding.id]: issue }));
      setNotice(`Jira issue ${issue.jiraKey} linked to this finding.`);
      const status = await apiRequest<{ integrations: JiraIntegration[] }>('/api/jira/status');
      setJiraIntegrations(status.integrations.filter((item) => item.connectedAt));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not create Jira issue.'); }
    finally { setJiraBusy(false); }
  }

  function changeFilter(key: keyof typeof query, value: string) { setPage(1); setQuery((current) => ({ ...current, [key]: value })); }
  const pageCount = Math.max(1, Math.ceil(result.total / result.pageSize));

  return <section className="page-stack">
    <header className="page-heading"><div><p className="eyebrow">Accessibility</p><h1>Findings</h1><p className="muted">Review automated axe-core results. An automated pass does not establish full WCAG conformance; manual review is still needed.</p></div></header>
    {error && <p className="form-error" role="alert">{error}</p>}{notice && <p className="form-success" role="status">{notice}</p>}
    <section className="panel"><div className="filter-grid">
      <label>Project<select value={query.projectId} onChange={(event) => changeFilter('projectId', event.target.value)}><option value="">All projects</option>{projects.length === 0 && <option disabled>{error ? 'Project options unavailable — check API connection' : 'No projects yet — create a project first'}</option>}{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
      <label>Severity<select value={query.severity} onChange={(event) => changeFilter('severity', event.target.value)}><option value="">All severities</option>{['CRITICAL', 'SERIOUS', 'MODERATE', 'MINOR'].map((value) => <option key={value}>{value}</option>)}</select></label>
      <label>Status<select value={query.status} onChange={(event) => changeFilter('status', event.target.value)}><option value="">All statuses</option>{['OPEN', 'IN_REVIEW', 'IGNORED', 'RESOLVED'].map((value) => <option key={value}>{value}</option>)}</select></label>
      <label>WCAG reference<input placeholder="e.g. 1.1.1" value={query.wcag} onChange={(event) => changeFilter('wcag', event.target.value)} /></label>
      <label>Search<input placeholder="Rule, title, or description" value={query.search} onChange={(event) => changeFilter('search', event.target.value)} /></label>
      <label>Sort by<select value={query.sortBy} onChange={(event) => changeFilter('sortBy', event.target.value)}><option value="createdAt">Finding date</option><option value="severity">Severity</option><option value="status">Status</option><option value="ruleId">Rule ID</option></select></label>
      <label>Order<select value={query.sortOrder} onChange={(event) => changeFilter('sortOrder', event.target.value)}><option value="desc">Descending</option><option value="asc">Ascending</option></select></label>
    </div></section>
    {loading ? <div className="panel" role="status">Loading findings…</div> : result.items.length === 0 ? <div className="panel"><h2>{error ? 'Findings unavailable' : 'No findings found'}</h2><p className="muted">{error ? 'Check the API connection and retry. Your findings will appear when the API is reachable.' : projects.length === 0 ? 'Create a project and run a scan to populate this page.' : 'Completed scans with automated violations will appear here. Try clearing filters or run a new scan.'}</p><div className="finding-actions">{error ? <button className="button button-primary" onClick={() => void loadFindings()}>Retry</button> : projects.length === 0 ? <Link className="button button-primary" href="/projects">Create a project</Link> : <><button className="button button-secondary" onClick={() => { setPage(1); setQuery({ projectId: '', severity: '', status: '', wcag: '', search: '', sortBy: 'createdAt', sortOrder: 'desc' }); }}>Clear filters</button><Link className="button button-primary" href="/scanner">Open scanner</Link></>}</div></div> : <>
      <div className="findings-table-wrap"><table className="findings-table"><caption className="sr-only">Accessibility findings for projects available to you</caption><thead><tr><th scope="col">Finding</th><th scope="col">Severity</th><th scope="col">WCAG</th><th scope="col">Project</th><th scope="col">Status</th><th scope="col">Assignee</th><th scope="col">Scan date</th><th scope="col">Details</th></tr></thead><tbody>{result.items.map((finding) => <tr key={finding.id}><th scope="row"><span className={`severity severity-${finding.severity.toLowerCase()}`}>{finding.severity}</span><br /><strong>{finding.title}</strong><br /><span className="muted">{finding.ruleId} · {finding.violationCount} element(s)</span></th><td>{finding.severity}</td><td>{finding.wcagTags.length ? finding.wcagTags.join(', ') : finding.wcag ?? '—'}</td><td>{finding.access.projectName}</td><td>{finding.status.replace('_', ' ')}</td><td>{finding.access.assignee?.fullName || finding.access.assignee?.email || 'Unassigned'}</td><td>{new Date(finding.createdAt).toLocaleDateString()}</td><td><button className="button button-secondary" onClick={() => void openFinding(finding.id)} type="button">View details</button></td></tr>)}</tbody></table></div>
      <nav className="pagination" aria-label="Finding pages"><button className="button button-secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page} of {pageCount} · {result.total} findings</span><button className="button button-secondary" disabled={page >= pageCount} onClick={() => setPage(page + 1)}>Next</button></nav>
    </>}
    {detailLoading && <div className="detail-overlay" role="status">Loading finding details…</div>}
    {selectedFinding && <div className="detail-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedFinding(null); }}><section aria-labelledby="finding-detail-title" aria-modal="true" className="panel finding-detail-panel" ref={detailDialogRef} role="dialog" tabIndex={-1}><div className="finding-card-heading"><div><p className="eyebrow">{selectedFinding.severity} · {selectedFinding.status.replace('_', ' ')}</p><h2 id="finding-detail-title">{selectedFinding.title}</h2><p className="muted">{selectedFinding.ruleId} · {selectedFinding.access.projectName} · {new Date(selectedFinding.createdAt).toLocaleString()}</p></div><button aria-label="Close finding details" className="button button-secondary" data-dialog-close onClick={() => setSelectedFinding(null)} type="button">Close</button></div>
      <p>{selectedFinding.description || 'No description was returned by the scanner.'}</p><dl className="finding-details"><dt>Severity / impact</dt><dd>{selectedFinding.severity} / {selectedFinding.impact ?? 'Not specified'}</dd><dt>WCAG criteria and tags</dt><dd>{selectedFinding.wcag ?? 'No mapping returned'} · {selectedFinding.wcagTags.join(', ') || 'No tags returned'}</dd><dt>Affected page</dt><dd>{selectedFinding.pageUrl ?? 'Unavailable'}</dd><dt>CSS selector</dt><dd><code>{selectedFinding.selector ?? 'Unavailable'}</code></dd><dt>Sanitized element context</dt><dd><code>{selectedFinding.snippet ?? 'Not captured'}</code></dd><dt>Failure summary</dt><dd>{selectedFinding.failureSummary ?? 'No element-level summary available.'}</dd><dt>Scan</dt><dd><a className="text-link" href="/scanner">{selectedFinding.access.scanId}</a> · {selectedFinding.access.scanStatus} · heuristic score {selectedFinding.access.score}/100</dd><dt>Assignment</dt><dd>{selectedFinding.access.assignee?.fullName || selectedFinding.access.assignee?.email || 'Unassigned'}</dd></dl>
      {(() => { const linked = jiraIssueByFinding[selectedFinding.id] ?? jiraIntegrations.flatMap((item) => item.issues).find((item) => item.findingId === selectedFinding.id); return <section className="panel" aria-label="Jira issue"><h3>Jira</h3>{linked ? <p>{linked.url ? <a className="text-link" href={linked.url} target="_blank" rel="noreferrer">{linked.jiraKey}</a> : linked.jiraKey} · {linked.status} · {linked.lastSyncedAt ? `Synced ${new Date(linked.lastSyncedAt).toLocaleString()}` : 'Not synced yet'}</p> : jiraIntegrations.length ? <><label>Destination Jira project<select value={jiraIntegrationId} onChange={(event) => setJiraIntegrationId(event.target.value)}>{jiraIntegrations.map((item) => <option key={item.id} value={item.id}>{item.baseUrl} · {item.projectKey}</option>)}</select></label>{aiAssistance?.findingId === selectedFinding.id && <label><input type="checkbox" checked={includeReviewedRemediation} onChange={(event) => setIncludeReviewedRemediation(event.target.checked)} /> I reviewed the AI remediation suggestion and want to include it in the Jira issue.</label>}<button className="button button-secondary" disabled={jiraBusy || !selectedFinding.access.writable} onClick={() => void createJiraIssue()} type="button">{jiraBusy ? 'Creating Jira issue…' : 'Create Jira issue'}</button><p className="muted">The issue includes safe finding context. AI remediation is included only after you confirm review.</p></> : <p className="muted">No Jira site connected. Connect one on the Jira page to create issues.</p>}</section>; })()}
      {selectedFinding.helpUrl && <p><a className="text-link" href={selectedFinding.helpUrl} rel="noreferrer" target="_blank">axe-core remediation guidance</a></p>}<p className="muted">axe-core results are automated checks, not a WCAG conformance determination. Manual review may be required.</p>
      {aiAssistance?.findingId === selectedFinding.id && <section className="panel" aria-label="AI-generated remediation guidance"><h3>AI-generated guidance — developer review required</h3><p><strong>{aiAssistance.explanation.summary}</strong></p><h4>Root cause</h4><p>{aiAssistance.explanation.rootCause}</p><h4>User impact and WCAG</h4><p>{aiAssistance.explanation.detail}</p><p>{aiAssistance.explanation.wcagExplanation}</p><h4>Suggested HTML</h4><pre><code>{aiAssistance.suggestion.htmlSuggestion}</code></pre><button className="button button-secondary" onClick={() => void copyAI(aiAssistance.suggestion.htmlSuggestion)} type="button">Copy HTML suggestion</button><h4>Suggested React / JSX</h4><pre><code>{aiAssistance.suggestion.jsxSuggestion}</code></pre><button className="button button-secondary" onClick={() => void copyAI(aiAssistance.suggestion.jsxSuggestion)} type="button">Copy JSX suggestion</button><p>{aiAssistance.suggestion.explanation}</p><h4>Verification steps</h4><ul>{[...aiAssistance.explanation.fixSteps, ...aiAssistance.explanation.testInstructions].map((step, index) => <li key={`${index}-${step}`}>{step}</li>)}</ul><p className="muted">Suggestions are untrusted examples. Review and test them; generated code is never executed or applied.</p></section>}
      {selectedFinding.access.writable ? <div className="finding-actions"><button className="button button-primary" disabled={aiBusy} onClick={() => void explainFinding(selectedFinding.id)} type="button">{aiBusy ? 'Generating AI guidance…' : aiAssistance?.findingId === selectedFinding.id ? 'Retry AI explanation' : 'Explain with AI'}</button><button className="button button-secondary" disabled={busyFindingId === selectedFinding.id} onClick={() => void verifyFinding(selectedFinding)} type="button">Verify fix</button><label>Status<select disabled={busyFindingId === selectedFinding.id} value={selectedFinding.status} onChange={(event) => void updateFinding(selectedFinding, 'status', event.target.value)}>{['OPEN', 'IN_REVIEW', 'IGNORED'].map((value) => <option key={value}>{value}</option>)}{(selectedFinding.access.canResolve || selectedFinding.status === 'RESOLVED') && <option value="RESOLVED">RESOLVED</option>}</select></label><label>Assignee<select disabled={busyFindingId === selectedFinding.id} value={selectedFinding.assignedToId ?? ''} onFocus={() => selectedFinding.access.teamId && void loadMembers(selectedFinding.access.teamId)} onChange={(event) => void updateFinding(selectedFinding, 'assign', event.target.value)}><option value="">Unassigned</option>{selectedFinding.access.teamId ? (members[selectedFinding.access.teamId] ?? []).length === 0 ? <option disabled>{membersLoading[selectedFinding.access.teamId] ? 'Loading team members…' : members[selectedFinding.access.teamId] ? 'No team members available' : 'Choose this field to load team members'}</option> : (members[selectedFinding.access.teamId] ?? []).map((member) => <option key={member.userId} value={member.userId}>{member.fullName || member.email} · {member.role}</option>) : profileId ? <option value={profileId}>Assign to me</option> : null}</select></label></div> : <p className="muted">Read-only for your current role.</p>}
    </section></div>}
  </section>;
}
