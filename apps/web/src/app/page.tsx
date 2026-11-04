'use client';

import { Activity, AlertTriangle, ArrowUpRight, FolderTree, GaugeCircle, ShieldCheck, Sparkles } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { dashboardData, scoreTrend } from '@/lib/mock-data';

const metrics = [
  { label: 'Total websites', value: dashboardData.totalWebsites, icon: FolderTree },
  { label: 'Total scans', value: dashboardData.totalScans, icon: Activity },
  { label: 'Accessibility score', value: `${dashboardData.accessibilityScore}%`, icon: GaugeCircle },
  { label: 'Critical issues', value: dashboardData.criticalIssues, icon: AlertTriangle }
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <header className="mb-8 flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg shadow-slate-950/30">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-cyan-400">AccessLens AI</p>
            <h1 className="mt-2 text-3xl font-bold text-white">Accessibility command center</h1>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-sm text-emerald-300">
            <ShieldCheck className="h-4 w-4" />
            Production-ready baseline
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {metrics.map(({ label, value, icon: Icon }) => (
            <div key={label} className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-sm text-slate-400">{label}</span>
                <span className="rounded-lg bg-slate-800 p-2 text-cyan-300"><Icon className="h-4 w-4" /></span>
              </div>
              <div className="text-3xl font-semibold text-white">{value}</div>
            </div>
          ))}
        </section>

        <section className="mt-8 grid gap-6 xl:grid-cols-[1.6fr_0.9fr]">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Score trend</p>
                <h2 className="mt-2 text-xl font-semibold text-white">Accessibility score over time</h2>
              </div>
              <div className="flex items-center gap-2 text-sm text-emerald-300">
                <ArrowUpRight className="h-4 w-4" />
                +12.6% since last month
              </div>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={scoreTrend}>
                  <defs>
                    <linearGradient id="scoreFill" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="#22d3ee" stopOpacity={0.1} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#334155" strokeDasharray="3 3" />
                  <XAxis dataKey="month" stroke="#94a3b8" />
                  <YAxis stroke="#94a3b8" domain={[60, 100]} />
                  <Tooltip />
                  <Area type="monotone" dataKey="score" stroke="#22d3ee" fillOpacity={1} fill="url(#scoreFill)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="mb-4 flex items-center gap-2 text-cyan-300">
              <Sparkles className="h-5 w-5" />
              <span className="text-sm uppercase tracking-[0.2em]">AI operations</span>
            </div>
            <div className="space-y-4">
              {dashboardData.recentActivities.map((activity) => (
                <div key={activity.title} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-white">{activity.title}</p>
                    <span className="rounded-full bg-slate-800 px-2 py-1 text-xs text-slate-300">{activity.type}</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-400">{activity.summary}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Issue mix</p>
            <ul className="mt-4 space-y-3 text-sm text-slate-300">
              <li className="flex justify-between"><span>Serious</span><span>{dashboardData.seriousIssues}</span></li>
              <li className="flex justify-between"><span>Moderate</span><span>{dashboardData.moderateIssues}</span></li>
              <li className="flex justify-between"><span>Minor</span><span>{dashboardData.minorIssues}</span></li>
              <li className="flex justify-between"><span>Resolved</span><span>{dashboardData.resolvedFindings}</span></li>
            </ul>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 lg:col-span-2">
            <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Recent scan history</p>
            <div className="mt-4 space-y-3">
              {dashboardData.scanHistory.map((scan) => (
                <div key={scan.id} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-sm text-slate-300">
                  <div>
                    <div className="font-medium text-white">{scan.project}</div>
                    <div className="text-slate-400">{scan.date}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="rounded-full border border-cyan-500/40 bg-cyan-500/10 px-2 py-1 text-cyan-300">{scan.score}%</span>
                    <span className="rounded-full bg-amber-500/10 px-2 py-1 text-amber-300">{scan.issues} findings</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
