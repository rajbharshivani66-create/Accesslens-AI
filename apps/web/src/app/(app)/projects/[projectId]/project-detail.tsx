'use client';

import { ArrowLeft, Save, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiRequest } from '@/lib/api';
import { useToast } from '@/components/app-shell/toast-provider';

interface Project {
  id: string;
  name: string;
  url: string;
  description: string | null;
  teamId: string | null;
  team: { id: string; name: string } | null;
  accessRole: string | null;
  canEdit: boolean;
  canDelete: boolean;
  createdAt: string;
  updatedAt: string;
}

export function ProjectDetail({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { pushToast } = useToast();

  const loadProject = useCallback(() => {
    setLoading(true);
    setError('');
    apiRequest<Project>(`/api/projects/${projectId}`)
      .then((data) => {
        setProject(data);
        setName(data.name);
        setUrl(data.url);
        setDescription(data.description ?? '');
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not load project.'))
      .finally(() => setLoading(false));
  }, [projectId]);
  useEffect(() => { loadProject(); }, [loadProject]);

  async function saveProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const updated = await apiRequest<Project>(`/api/projects/${projectId}`, {
        method: 'PUT',
        body: JSON.stringify({ name, url, description })
      });
      setProject(updated);
      pushToast('success', 'Project changes saved.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update project.');
    } finally {
      setBusy(false);
    }
  }

  async function removeProject() {
    if (!project || !window.confirm(`Delete "${project.name}" and its project data?`)) return;
    setBusy(true);
    setError('');
    try {
      await apiRequest<void>(`/api/projects/${projectId}`, { method: 'DELETE' });
      router.replace('/projects');
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not delete project.');
      setBusy(false);
    }
  }

  if (loading) return <div aria-live="polite" className="loading-panel">Loading project…</div>;
  if (!project) {
    return (
      <section className="page-section">
        <Link className="text-link" href="/projects"><ArrowLeft size={16} /> Back to projects</Link>
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        <button className="button button-secondary" onClick={loadProject} type="button">Retry</button>
      </section>
    );
  }

  return (
    <section className="page-section">
      <Link className="text-link back-link" href="/projects"><ArrowLeft size={16} /> Back to projects</Link>
      <div className="page-heading">
        <div>
          <p className="eyebrow">PROJECT DETAILS</p>
          <h1>{project.name}</h1>
          <p className="muted">Created {new Date(project.createdAt).toLocaleDateString()}</p>
        </div>
        <div className="project-actions">
          {project.canEdit && <Link className="button button-primary" href="/scanner">Run scan</Link>}
          {project.canDelete && (
            <button className="button button-danger-outline" disabled={busy} onClick={() => void removeProject()} type="button">
              <Trash2 size={17} /> Delete
            </button>
          )}
        </div>
      </div>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <section className="surface-card detail-card">
        <h2>Website information</h2>
        <p className="muted">
          {project.team
            ? `Shared with ${project.team.name}. Your team role is ${project.accessRole?.toLowerCase() ?? 'member'}.`
            : 'Private to your account.'}
          {!project.canEdit && ' Your current role is read-only.'}
        </p>
        <form className="form-stack detail-form" onSubmit={saveProject}>
          <label>
            Project name
            <input disabled={!project.canEdit || busy} maxLength={100} minLength={2} onChange={(event) => setName(event.target.value)} required value={name} />
          </label>
          <label>
            Website URL
            <input disabled={!project.canEdit || busy} onChange={(event) => setUrl(event.target.value)} required type="url" value={url} />
          </label>
          <label>
            Description
            <textarea disabled={!project.canEdit || busy} maxLength={500} onChange={(event) => setDescription(event.target.value)} rows={4} value={description} />
          </label>
          <div>
            {project.canEdit && (
              <button className="button button-primary" disabled={busy} type="submit">
                <Save size={17} /> {busy ? 'Saving…' : 'Save changes'}
              </button>
            )}
          </div>
        </form>
      </section>
    </section>
  );
}
