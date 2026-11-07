'use client';
import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '@/lib/api';
type Notice = { id: string; type: string; title: string; body: string; read: boolean; createdAt: string };
type Result = { items: Notice[]; total: number; unread: number; page: number; pageSize: number };
export default function NotificationsPage() {
  const [data, setData] = useState<Result>({ items: [], total: 0, unread: 0, page: 1, pageSize: 20 }); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [page, setPage] = useState(1);
  const load = useCallback(async () => { setLoading(true); setError(''); try { setData(await apiRequest<Result>(`/api/notifications?page=${page}&pageSize=20`)); } catch (e) { setError(e instanceof Error ? e.message : 'Notifications could not be loaded.'); } finally { setLoading(false); } }, [page]);
  useEffect(() => { void load(); }, [load]);
  async function markRead(id: string) { try { await apiRequest<void>(`/api/notifications/${encodeURIComponent(id)}/read`, { method: 'PATCH' }); await load(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not update notification.'); } }
  async function markAll() { try { await apiRequest('/api/notifications/read-all', { method: 'POST' }); await load(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not update notifications.'); } }
  return <section className="page-stack"><header className="page-header"><div><p className="eyebrow">WORKSPACE</p><h1>Notifications</h1><p className="muted">Persistent updates for your account.</p></div><button className="button button-secondary" onClick={() => void markAll()} disabled={!data.unread}>Mark all read ({data.unread})</button></header>
    {error && <p role="alert" className="error-panel">{error}</p>}{loading ? <p className="loading-panel">Loading notifications…</p> : data.items.length === 0 ? <section className="empty-panel"><h2>You’re all caught up</h2><p>New activity notifications will appear here.</p></section> : <section className="card-stack" aria-label="Notifications">{data.items.map((item) => <article className="panel" key={item.id}><div className="page-header"><div><span className="eyebrow">{item.type.replaceAll('_', ' ')}</span><h2>{item.title}</h2></div>{!item.read && <span className="status-pill">Unread</span>}</div><p>{item.body}</p><p className="muted">{new Date(item.createdAt).toLocaleString()}</p>{!item.read && <button className="button button-secondary" onClick={() => void markRead(item.id)}>Mark read</button>}</article>)}</section>}
    <nav className="pagination" aria-label="Notification pages"><button className="button button-secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page} · {data.total} notifications</span><button className="button button-secondary" disabled={page * data.pageSize >= data.total} onClick={() => setPage(page + 1)}>Next</button></nav></section>;
}
