'use client';

import { ArrowRight, Globe2, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
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
  updatedAt: string;
}

interface TeamOption {
  id: string;
  name: string;
  myRole: 'OWNER' | 'ADMIN' | 'DEVELOPER' | 'VIEWER';
}

interface ProjectList {
  items: Project[];
  pagination: { page: number; totalPages: number; total: number };
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [teamId, setTeamId] = useState('');
  const [availableTeams, setAvailableTeams] = useState<TeamOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { pushToast } = useToast();

  const refreshProjects = useCallback(async () => {
    const result = await apiRequest<ProjectList>('/api/projects?page=1&pageSize=100');
    setProjects(result.items);
  }, []);

  useEffect(() => {
    Promise.all([
      refreshProjects(),
      apiRequest<TeamOption[]>('/api/teams').then((teams) => {
        setAvailableTeams(teams.filter((team) => team.myRole !== 'VIEWER'));
      })
    ])
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not load projects.'))
      .finally(() => setLoading(false));
  }, [refreshProjects]);

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await apiRequest<Project>('/api/projects', {
        method: 'POST',
        body: JSON.stringify({
          name,
          url,
          description: description || undefined,
          teamId: teamId || null
        })
      });
      setName('');
      setUrl('');
      setDescription('');
      setTeamId('');
      await refreshProjects();
      pushToast('success', 'Project created.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create project.');
    } finally {
      setBusy(false);
    }
  }

  async function deleteProject(project: Project) {
    if (!window.confirm(`Delete "${project.name}" and its project data?`)) return;
    setError('');
    try {
      await apiRequest<void>(`/api/projects/${project.id}`, { method: 'DELETE' });
      await refreshProjects();
      pushToast('success', 'Project deleted.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not delete project.');
    }
  }

  return (
    <section className="page-section">
      <div className="page-heading">
        <div>
          <p className="eyebrow">WORKSPACE</p>
          <h1>Projects</h1>
          <p className="muted">Manage your personal websites and projects shared with your teams.</p>
        </div>
      </div>
      {error && <div className="alert alert-error" role="alert">{error}</div>}

      <div className="projects-layout">
        <section className="surface-card">
          <div className="card-heading">
            <div>
              <h2>Your websites</h2>
              <p className="muted">{projects.length} {projects.length === 1 ? 'project' : 'projects'}</p>
            </div>
          </div>
          {loading ? (
            <div aria-live="polite" className="loading-panel">Loading projects…</div>
          ) : projects.length === 0 ? (
            <div className="compact-empty">
              <Globe2 size={21} />
              <p>No projects yet. Create one with the form.</p>
            </div>
          ) : (
            <div className="project-list">
              {projects.map((project) => (
                <article className="project-row project-row-card" key={project.id}>
                  <span className="project-avatar"><Globe2 size={18} /></span>
                  <Link className="project-row-copy" href={`/projects/${project.id}`}>
                    <strong>{project.name}</strong>
                    <span>{project.url}</span>
                    <span>{project.team ? `Team: ${project.team.name}` : 'Personal project'}</span>
                    {project.description && <span>{project.description}</span>}
                  </Link>
                  {project.canDelete && (
                    <button
                      aria-label={`Delete ${project.name}`}
                      className="icon-button danger-icon"
                      onClick={() => void deleteProject(project)}
                      title="Delete project"
                      type="button"
                    >
                      <Trash2 size={17} />
                    </button>
                  )}
                  <Link aria-label={`Open ${project.name}`} className="icon-button" href={`/projects/${project.id}`}>
                    <ArrowRight size={17} />
                  </Link>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="surface-card create-project-card">
          <div className="card-heading">
            <div>
              <span className="card-kicker"><Plus size={16} /> NEW PROJECT</span>
              <h2>Add a website</h2>
              <p className="muted">Choose whether this project is private or shared with a team.</p>
            </div>
          </div>
          <form className="form-stack" onSubmit={createProject}>
            <label>
              Project name
              <input maxLength={100} minLength={2} onChange={(event) => setName(event.target.value)} required value={name} />
            </label>
            <label>
              Website URL
              <input
                autoComplete="url"
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://example.com"
                required
                type="url"
                value={url}
              />
            </label>
            <label>
              Description <span className="optional-label">Optional</span>
              <textarea
                maxLength={500}
                onChange={(event) => setDescription(event.target.value)}
                rows={3}
                value={description}
              />
            </label>
            <label>
              Share with team
              <select onChange={(event) => setTeamId(event.target.value)} value={teamId}>
                <option value="">Personal project</option>
                {availableTeams.length === 0 && <option disabled>{error ? 'Team options unavailable — check API connection' : 'No teams yet — create one from Team'}</option>}
                {availableTeams.map((team) => (
                  <option key={team.id} value={team.id}>{team.name} · {team.myRole.toLowerCase()}</option>
                ))}
              </select>
            </label>
            <button className="button button-primary button-full" disabled={busy} type="submit">
              <Plus size={17} /> {busy ? 'Creating…' : 'Create project'}
            </button>
          </form>
        </section>
      </div>
    </section>
  );
}
