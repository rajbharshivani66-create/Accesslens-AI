'use client';

import {
  Activity,
  ArrowRight,
  Bug,
  CircleCheck,
  FolderKanban,
  Gauge,
  ShieldAlert
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { apiRequest } from '@/lib/api';

type DashboardRange = '7d' | '30d' | '90d';
type ScanStatus = 'QUEUED' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';

interface DashboardSummary {
  range: DashboardRange;
  metrics: {
    projectCount: number;
    scans: {
      total: number;
      byStatus: Record<ScanStatus, number>;
    };
    findings: {
      total: number;
      byStatus: { OPEN: number; IN_REVIEW: number; RESOLVED: number };
      bySeverity: { CRITICAL: number; SERIOUS: number; MODERATE: number; MINOR: number };
    };
    accessibilityScore: number | null;
    scoredProjectCount: number;
  };
  trends: Array<{ date: string; scans: number; findings: number }>;
  recentScans: Array<{
    id: string;
    projectName: string;
    status: ScanStatus;
    score: number;
    startedAt: string;
    completedAt: string | null;
    findingCount: number;
  }>;
  projectPerformance: Array<{
    id: string;
    name: string;
    url: string;
    scanCount: number;
    latestScore: number | null;
    lastScannedAt: string | null;
  }>;
  recentActivity: Array<{
    id: string;
    action: string;
    entityType: string | null;
    entityId: string | null;
    createdAt: string;
  }>;
}

const severityLabels = [
  { key: 'CRITICAL', label: 'Critical' },
  { key: 'SERIOUS', label: 'Serious' },
  { key: 'MODERATE', label: 'Moderate' },
  { key: 'MINOR', label: 'Minor' }
] as const;

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric'
  });
}

function statusLabel(status: ScanStatus): string {
  return status.replace('_', ' ').toLowerCase().replace(/^\w/, (letter) => letter.toUpperCase());
}

export default function DashboardPage() {
  const [range, setRange] = useState<DashboardRange>('30d');
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');

    apiRequest<DashboardSummary>(`/api/dashboard/summary?range=${range}`)
      .then((result) => {
        if (active) setSummary(result);
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(cause instanceof Error ? cause.message : 'Could not load dashboard data.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [range]);

  const severityData = summary
    ? severityLabels.map(({ key, label }) => ({
        severity: label,
        findings: summary.metrics.findings.bySeverity[key]
      }))
    : [];
  const hasTrendData = summary?.trends.some((day) => day.scans > 0 || day.findings > 0) ?? false;
  const hasSeverityData = summary
    ? Object.values(summary.metrics.findings.bySeverity).some((count) => count > 0)
    : false;

  return (
    <section className="page-section">
      <div className="page-heading">
        <div>
          <p className="eyebrow">OVERVIEW</p>
          <h1>Dashboard</h1>
          <p className="muted">Workspace metrics from your saved projects and scan history.</p>
        </div>
        <div className="dashboard-heading-actions">
          <label className="dashboard-range-label" htmlFor="dashboard-range">Trend period</label>
          <select
            className="dashboard-range-select"
            id="dashboard-range"
            onChange={(event) => setRange(event.target.value as DashboardRange)}
            value={range}
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
          </select>
          <Link className="button button-primary" href="/projects">
            <FolderKanban size={17} /> Projects
          </Link>
        </div>
      </div>

      {error && <div className="alert alert-error" role="alert">{error}</div>}

      {loading && !summary ? (
        <div aria-live="polite" className="loading-panel">Loading your workspace metrics…</div>
      ) : summary ? (
        <>
          <div aria-busy={loading} className="metric-grid dashboard-metric-grid">
            <article className="metric-card">
              <span className="metric-icon"><FolderKanban size={19} /></span>
              <span className="metric-label">Projects</span>
              <strong>{summary.metrics.projectCount}</strong>
              <span className="metric-note">Owned by your account</span>
            </article>
            <article className="metric-card">
              <span className="metric-icon"><Activity size={19} /></span>
              <span className="metric-label">Scans</span>
              <strong>{summary.metrics.scans.total}</strong>
              <span className="metric-note">
                {summary.metrics.scans.byStatus.COMPLETED} completed ·{' '}
                {summary.metrics.scans.byStatus.IN_PROGRESS +
                  summary.metrics.scans.byStatus.QUEUED} active
              </span>
            </article>
            <article className="metric-card">
              <span className="metric-icon"><Bug size={19} /></span>
              <span className="metric-label">Open findings</span>
              <strong>{summary.metrics.findings.byStatus.OPEN}</strong>
              <span className="metric-note">
                {summary.metrics.findings.byStatus.RESOLVED} resolved ·{' '}
                {summary.metrics.findings.byStatus.IN_REVIEW} in review
              </span>
            </article>
            <article className="metric-card">
              <span className="metric-icon"><ShieldAlert size={19} /></span>
              <span className="metric-label">Critical findings</span>
              <strong>{summary.metrics.findings.bySeverity.CRITICAL}</strong>
              <span className="metric-note">Across your saved scans</span>
            </article>
            <article className="metric-card">
              <span className="metric-icon"><Gauge size={19} /></span>
              <span className="metric-label">Average latest score</span>
              <strong>
                {summary.metrics.accessibilityScore === null
                  ? '—'
                  : `${summary.metrics.accessibilityScore}%`}
              </strong>
              <span className="metric-note">
                {summary.metrics.scoredProjectCount
                  ? `Average of ${summary.metrics.scoredProjectCount} projects`
                  : 'Available after completed scans'}
              </span>
            </article>
          </div>

          <p className="dashboard-disclaimer">
            The score is the rounded average of each project&apos;s latest completed scan score.
            Automated results are not proof of WCAG compliance.
          </p>

          <div className="dashboard-chart-grid">
            <section aria-labelledby="scan-trend-title" className="surface-card dashboard-chart-card">
              <div className="card-heading">
                <div>
                  <h2 id="scan-trend-title">Scan and finding activity</h2>
                  <p className="muted">Daily records created in the selected period.</p>
                </div>
              </div>
              {hasTrendData ? (
                <div aria-label="Daily scan and finding activity chart" role="img" className="dashboard-chart">
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={summary.trends} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                      <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                      <XAxis
                        axisLine={false}
                        dataKey="date"
                        tick={{ fill: '#94a3b8', fontSize: 10 }}
                        tickFormatter={(value: string) => formatDate(value)}
                        tickLine={false}
                      />
                      <YAxis allowDecimals={false} axisLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} tickLine={false} />
                      <Tooltip
                        contentStyle={{ background: '#0c1423', border: '1px solid #334155', borderRadius: 9 }}
                        labelFormatter={(value) => formatDate(String(value))}
                      />
                      <Legend />
                      <Line dataKey="scans" dot={false} name="Scans" stroke="#22d3ee" strokeWidth={2} type="monotone" />
                      <Line dataKey="findings" dot={false} name="Findings" stroke="#a78bfa" strokeWidth={2} type="monotone" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="dashboard-chart-empty">
                  No scan or finding records in this period yet.
                </div>
              )}
            </section>

            <section aria-labelledby="severity-title" className="surface-card dashboard-chart-card">
              <div className="card-heading">
                <div>
                  <h2 id="severity-title">Findings by severity</h2>
                  <p className="muted">Persisted findings across your projects.</p>
                </div>
              </div>
              {hasSeverityData ? (
                <div aria-label="Finding counts by severity chart" role="img" className="dashboard-chart">
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={severityData} layout="vertical" margin={{ top: 4, right: 14, left: 8, bottom: 0 }}>
                      <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" horizontal={false} />
                      <XAxis allowDecimals={false} axisLine={false} type="number" tick={{ fill: '#94a3b8', fontSize: 10 }} tickLine={false} />
                      <YAxis axisLine={false} dataKey="severity" type="category" tick={{ fill: '#cbd5e1', fontSize: 11 }} tickLine={false} width={72} />
                      <Tooltip contentStyle={{ background: '#0c1423', border: '1px solid #334155', borderRadius: 9 }} />
                      <Bar dataKey="findings" fill="#22d3ee" radius={[0, 5, 5, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="dashboard-chart-empty">
                  <CircleCheck aria-hidden="true" size={20} />
                  No findings have been saved yet.
                </div>
              )}
            </section>
          </div>

          <section aria-labelledby="project-performance-title" className="surface-card">
            <div className="section-heading dashboard-section-heading">
              <div>
                <h2 id="project-performance-title">Project performance</h2>
                <p className="muted">Latest persisted scan results for your 8 most recently updated projects.</p>
              </div>
              <Link className="text-link" href="/projects">All projects <ArrowRight size={16} /></Link>
            </div>
            {summary.projectPerformance.length === 0 ? (
              <div className="dashboard-chart-empty">Create a project to see its scan performance.</div>
            ) : (
              <div className="dashboard-table-wrap">
                <table className="dashboard-table">
                  <thead>
                    <tr><th scope="col">Project</th><th scope="col">Scans</th><th scope="col">Latest score</th><th scope="col">Last completed scan</th></tr>
                  </thead>
                  <tbody>
                    {summary.projectPerformance.map((project) => (
                      <tr key={project.id}>
                        <th scope="row">
                          <Link href={`/projects/${project.id}`}>{project.name}</Link>
                          <span>{project.url}</span>
                        </th>
                        <td>{project.scanCount}</td>
                        <td>{project.latestScore === null ? '—' : `${project.latestScore}%`}</td>
                        <td>{project.lastScannedAt ? formatDate(project.lastScannedAt) : 'No completed scan'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <div className="dashboard-chart-grid">
            <section aria-labelledby="recent-scans-title" className="surface-card">
              <div className="section-heading dashboard-section-heading">
                <div>
                  <h2 id="recent-scans-title">Recent scans</h2>
                  <p className="muted">Latest scan records from your projects.</p>
                </div>
              </div>
              {summary.recentScans.length === 0 ? (
                <div className="dashboard-chart-empty">No scans have been saved yet.</div>
              ) : (
                <div className="dashboard-record-list">
                  {summary.recentScans.map((scan) => (
                    <div className="dashboard-record-row" key={scan.id}>
                      <span className={`dashboard-status dashboard-status-${scan.status.toLowerCase()}`}>
                        {statusLabel(scan.status)}
                      </span>
                      <div className="dashboard-record-copy">
                        <strong>{scan.projectName}</strong>
                        <span>{formatDate(scan.startedAt)} · {scan.findingCount} findings</span>
                      </div>
                      <span className="dashboard-record-value">
                        {scan.status === 'COMPLETED' ? `${scan.score}%` : '—'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section aria-labelledby="recent-activity-title" className="surface-card">
              <div className="section-heading dashboard-section-heading">
                <div>
                  <h2 id="recent-activity-title">Recent activity</h2>
                  <p className="muted">Account activity recorded by the application.</p>
                </div>
              </div>
              {summary.recentActivity.length === 0 ? (
                <div className="dashboard-chart-empty">No activity has been recorded yet.</div>
              ) : (
                <div className="dashboard-record-list">
                  {summary.recentActivity.map((activity) => (
                    <div className="dashboard-record-row" key={activity.id}>
                      <span className="metric-icon"><Activity size={16} /></span>
                      <div className="dashboard-record-copy">
                        <strong>{activity.action}</strong>
                        <span>{activity.entityType ?? 'Workspace'} · {formatDate(activity.createdAt)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </>
      ) : null}
    </section>
  );
}
