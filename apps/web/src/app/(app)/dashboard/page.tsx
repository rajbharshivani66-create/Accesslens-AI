'use client';

import { ArrowRight, FolderKanban, Plus, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { apiRequest } from '@/lib/api';

interface ProjectSummary {
  id: string;
  name: string;
  url: string;
  updatedAt: string;
}

interface ProjectList {
  items: ProjectSummary[];
  pagination: { total: number };
}

export default function DashboardPage() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    apiRequest<ProjectList>('/api/projects?page=1&pageSize=5')
      .then((result) => {
        setProjects(result.items);
        setTotal(result.pagination.total);
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'Could not load dashboard data.');
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <section className="page-section">
      <div className="page-heading">
        <div>
          <p className="eyebrow">OVERVIEW</p>
          <h1>Dashboard</h1>
          <p className="muted">A clear view of your accessibility workspace.</p>
        </div>
        <Link className="button button-primary" href="/projects">
          <Plus size={17} /> Add a project
        </Link>
      </div>

      {error && <div className="alert alert-error" role="alert">{error}</div>}

      <div className="metric-grid">
        <article className="metric-card">
          <span className="metric-icon"><FolderKanban size={19} /></span>
          <span className="metric-label">Websites</span>
          <strong>{loading ? '…' : total}</strong>
          <span className="metric-note">Projects in your workspace</span>
        </article>
        <article className="metric-card metric-card-muted">
          <span className="metric-icon"><ShieldCheck size={19} /></span>
          <span className="metric-label">Accessibility scans</span>
          <strong>—</strong>
          <span className="metric-note">Scanner arrives in a later phase</span>
        </article>
      </div>

      <div className="section-heading">
        <div>
          <h2>Recent projects</h2>
          <p className="muted">Your latest websites, loaded from your account.</p>
        </div>
        <Link className="text-link" href="/projects">All projects <ArrowRight size={16} /></Link>
      </div>

      {loading ? (
        <div aria-live="polite" className="loading-panel">Loading your projects…</div>
      ) : projects.length === 0 ? (
        <div className="empty-panel">
          <span className="empty-icon"><FolderKanban size={22} /></span>
          <h2>Your workspace is ready</h2>
          <p>Add a website project to begin organizing your accessibility work.</p>
          <Link className="button button-primary" href="/projects"><Plus size={17} /> Create first project</Link>
        </div>
      ) : (
        <div className="project-list">
          {projects.map((project) => (
            <Link className="project-row" href={`/projects/${project.id}`} key={project.id}>
              <span className="project-avatar"><FolderKanban size={18} /></span>
              <span className="project-row-copy">
                <strong>{project.name}</strong>
                <span>{project.url}</span>
              </span>
              <span className="project-row-date">{new Date(project.updatedAt).toLocaleDateString()}</span>
              <ArrowRight aria-hidden="true" className="project-row-arrow" size={17} />
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
