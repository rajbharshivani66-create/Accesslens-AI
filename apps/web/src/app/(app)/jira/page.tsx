'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '@/lib/api';

type JiraSite = { id: string; name: string; url: string; scopes: string[] };
type JiraProject = { id: string; key: string; name: string };
type JiraIssue = { id: string; jiraKey: string; title: string; status: string; url: string | null; findingId: string | null; createdAt: string; lastSyncedAt: string | null };
type Integration = { id: string; cloudId: string | null; baseUrl: string; projectKey: string; connectedAt: string | null; scopes: string[]; issues: JiraIssue[] };
type Finding = { id: string; title: string; ruleId: string; severity: string; status: string; access: { writable: boolean } };

export default function JiraPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [pendingState, setPendingState] = useState('');
  const [sites, setSites] = useState<JiraSite[]>([]);
  const [projects, setProjects] = useState<JiraProject[]>([]);
  const [cloudId, setCloudId] = useState('');
  const [projectKey, setProjectKey] = useState('');
  const [selectedIntegrationId, setSelectedIntegrationId] = useState('');
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [status, findingResult] = await Promise.all([
        apiRequest<{ configured: boolean; integrations: Integration[] }>('/api/jira/status'),
        apiRequest<{ items: Finding[] }>('/api/findings?page=1&pageSize=100')
      ]);
      setIntegrations(status.integrations);
      setConfigured(status.configured);
      setFindings(findingResult.items.filter((finding) => finding.access.writable));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load Jira integrations.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    void load();
    const query = new URLSearchParams(window.location.search);
    const state = query.get('jira_state');
    const callbackError = query.get('jira_error');
    if (state) {
      window.history.replaceState({}, '', window.location.pathname);
      setPendingState(state);
      apiRequest<{ sites: JiraSite[] }>(`/api/jira/pending?state=${encodeURIComponent(state)}`).then((pending) => {
        setSites(pending.sites);
        if (pending.sites[0]) setCloudId(pending.sites[0].id);
      }).catch(() => setError('Jira authorization could not be completed. Start the connection again.'));
    } else if (callbackError) {
      window.history.replaceState({}, '', window.location.pathname);
      setError(callbackError === 'no_accessible_sites' ? 'No Jira sites with the required permissions were returned.' : 'Jira authorization was not completed.');
    }
  }, [load]);

  useEffect(() => {
    if (!pendingState || !cloudId) { setProjects([]); return; }
    apiRequest<JiraProject[]>(`/api/jira/projects?state=${encodeURIComponent(pendingState)}&cloudId=${encodeURIComponent(cloudId)}`)
      .then((items) => { setProjects(items); setProjectKey(items[0]?.key ?? ''); })
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not load Jira projects.'));
  }, [pendingState, cloudId]);

  async function connect() {
    setBusy('connect'); setError('');
    try {
      const result = await apiRequest<{ authorizationUrl: string }>('/api/jira/connect', { method: 'POST' });
      window.location.assign(result.authorizationUrl);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not start Jira authorization.'); setBusy(''); }
  }

  async function complete() {
    setBusy('complete'); setError('');
    try {
      await apiRequest('/api/jira/complete', { method: 'POST', body: JSON.stringify({ state: pendingState, cloudId, projectKey }) });
      setPendingState(''); setSites([]); setProjects([]); setNotice('Jira site and project connected.'); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not connect this Jira project.'); }
    finally { setBusy(''); }
  }

  async function disconnect(integrationId: string) {
    setBusy(integrationId); setError('');
    try {
      await apiRequest<void>(`/api/jira/integrations/${integrationId}`, { method: 'DELETE' });
      setNotice('Jira disconnected. Existing issue references were retained.'); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not disconnect Jira.'); }
    finally { setBusy(''); }
  }

  async function sync(integrationId: string) {
    setBusy(`sync-${integrationId}`); setError('');
    try {
      const result = await apiRequest<{ synced: number; unavailable: number }>(`/api/jira/integrations/${integrationId}/sync`, { method: 'POST' });
      setNotice(`Synchronized ${result.synced} Jira issue status(es); ${result.unavailable} unavailable.`); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not synchronize Jira issues.'); }
    finally { setBusy(''); }
  }

  async function createIssue(finding: Finding) {
    setBusy(finding.id); setError(''); setNotice('');
    try {
      const issue = await apiRequest<JiraIssue>('/api/jira/issues', { method: 'POST', body: JSON.stringify({ findingId: finding.id, integrationId: selectedIntegrationId || undefined }) });
      setNotice(`Jira issue ${issue.jiraKey} linked to the finding.`); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not create a Jira issue.'); }
    finally { setBusy(''); }
  }

  const connected = integrations.filter((item) => item.connectedAt);
  return <section className="page-stack">
    <header className="page-heading"><div><p className="eyebrow">Integrations</p><h1>Jira</h1><p className="muted">Connect a Jira Cloud site using OAuth 2.0, choose a project, and create issues from authorized accessibility findings.</p></div></header>
    {error && <p className="form-error" role="alert">{error}</p>}{notice && <p className="form-success" role="status">{notice}</p>}
    <section className="panel"><h2>Connect a Jira site</h2><p className="muted">Access tokens stay encrypted on the API server. Jira permissions still apply to the authorizing account.</p>{!configured && <p className="form-error">Jira OAuth is not configured by the server administrator.</p>}<button className="button button-primary" disabled={!configured || busy === 'connect'} onClick={() => void connect()}>{busy === 'connect' ? 'Redirecting…' : 'Connect Jira with OAuth'}</button></section>
    {pendingState && <section className="panel form-stack"><h2>Choose site and project</h2><label>Jira site<select value={cloudId} onChange={(event) => setCloudId(event.target.value)}>{sites.map((site) => <option key={site.id} value={site.id}>{site.name} ({site.url})</option>)}</select></label><label>Project<select value={projectKey} onChange={(event) => setProjectKey(event.target.value)}>{projects.map((project) => <option key={project.id} value={project.key}>{project.key} · {project.name}</option>)}</select></label><button className="button button-primary" disabled={!projectKey || busy === 'complete'} onClick={() => void complete()}>{busy === 'complete' ? 'Connecting…' : 'Save Jira project'}</button></section>}
    {loading ? <section className="panel" role="status">Loading Jira connections…</section> : connected.length === 0 ? <section className="panel"><h2>No connected Jira sites</h2><p className="muted">Authorize a site to enable issue creation.</p></section> : <section className="finding-list" aria-label="Connected Jira integrations">{connected.map((integration) => <article className="panel finding-card" key={integration.id}><div className="finding-card-heading"><div><p className="eyebrow">Connected · {integration.scopes.join(', ')}</p><h2>{integration.baseUrl}</h2><p className="muted">Project {integration.projectKey}</p></div><div className="finding-actions"><button className="button button-secondary" disabled={busy === `sync-${integration.id}`} onClick={() => void sync(integration.id)}>{busy === `sync-${integration.id}` ? 'Syncing…' : 'Sync issue status'}</button><button className="button button-secondary" disabled={busy === integration.id} onClick={() => void disconnect(integration.id)}>Disconnect</button></div></div><h3>Recent linked issues</h3>{integration.issues.length === 0 ? <p className="muted">No issues have been created from AccessLens findings.</p> : <ul>{integration.issues.map((issue) => <li key={issue.id}>{issue.url ? <a className="text-link" href={issue.url} target="_blank" rel="noreferrer">{issue.jiraKey}</a> : issue.jiraKey} · {issue.title} · {issue.status} · {issue.lastSyncedAt ? `Synced ${new Date(issue.lastSyncedAt).toLocaleString()}` : 'Not synced yet'}</li>)}</ul>}</article>)}</section>}
    {connected.length > 0 && <section className="panel"><h2>Create Jira issue from a finding</h2><label>Destination<select value={selectedIntegrationId} onChange={(event) => setSelectedIntegrationId(event.target.value)}><option value="">Select Jira project…</option>{connected.map((item) => <option key={item.id} value={item.id}>{item.baseUrl} · {item.projectKey}</option>)}</select></label>{findings.length === 0 ? <p className="muted">No writable findings are available.</p> : <div className="list-stack">{findings.slice(0, 30).map((finding) => <div className="list-row" key={finding.id}><div><strong>{finding.severity} · {finding.title}</strong><p className="muted">{finding.ruleId} · {finding.status}</p></div><button className="button button-secondary" disabled={!selectedIntegrationId || busy === finding.id} onClick={() => void createIssue(finding)}>{busy === finding.id ? 'Working…' : 'Create issue'}</button></div>)}</div>}</section>}
  </section>;
}
