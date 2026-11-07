'use client';
import { useEffect, useState } from 'react';
import { apiRequest } from '@/lib/api';
type Item = { id: string; action: string; entityType: string | null; entityId: string | null; details: unknown; createdAt: string };
export default function ActivityPage() {
  const [items, setItems] = useState<Item[]>([]); const [error, setError] = useState(''); const [loading, setLoading] = useState(true);
  useEffect(() => { apiRequest<{ items: Item[] }>('/api/activity?page=1&pageSize=50').then((result) => setItems(result.items)).catch((e: unknown) => setError(e instanceof Error ? e.message : 'Activity could not be loaded.')).finally(() => setLoading(false)); }, []);
  return <section className="page-stack"><header className="page-header"><div><p className="eyebrow">AUDIT</p><h1>Activity</h1><p className="muted">Recent scan and verification events for your account.</p></div></header>{error && <p role="alert" className="error-panel">{error}</p>}{loading ? <p className="loading-panel">Loading activity…</p> : items.length ? <section className="card-stack">{items.map((item) => <article className="panel" key={item.id}><h2>{item.action.replaceAll('.', ' ')}</h2><p className="muted">{item.entityType ?? 'Event'} {item.entityId ? `· ${item.entityId}` : ''} · {new Date(item.createdAt).toLocaleString()}</p></article>)}</section> : <section className="empty-panel"><h2>No activity yet</h2><p>Completed scans and verifications will be recorded here.</p></section>}</section>;
}
