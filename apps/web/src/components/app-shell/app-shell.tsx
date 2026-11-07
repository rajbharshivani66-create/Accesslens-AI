'use client';

import {
  Activity,
  ArrowLeft,
  Bell,
  Blocks,
  Bug,
  ChartNoAxesCombined,
  CircleCheck,
  FolderKanban,
  Gauge,
  LifeBuoy,
  LogOut,
  Settings,
  Shield,
  Sparkles,
  Users
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { apiRequest } from '@/lib/api';
import { ThemeToggle } from './theme-toggle';

const navigation = [
  { label: 'Dashboard', href: '/dashboard', icon: Gauge },
  { label: 'Projects', href: '/projects', icon: FolderKanban },
  { label: 'Scanner', href: '/scanner', icon: Activity },
  { label: 'Findings', href: '/findings', icon: Bug },
  { label: 'AI fixes', href: '/ai-fixes', icon: Sparkles },
  { label: 'Verification', href: '/verification', icon: CircleCheck },
  { label: 'Jira', href: '/jira', icon: Blocks },
  { label: 'Analytics', href: '/analytics', icon: ChartNoAxesCombined },
  { label: 'Activity', href: '/activity', icon: Activity },
  { label: 'Team', href: '/team', icon: Users },
  { label: 'Notifications', href: '/notifications', icon: Bell },
  { label: 'Settings', href: '/settings', icon: Settings }
];

interface ProfileSummary {
  fullName: string | null;
  email: string;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileSummary | null>(null);
  const [error, setError] = useState('');
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [signingOut, setSigningOut] = useState(false);
  const accountName = profile?.fullName?.trim() || profile?.email || 'Account';
  const avatarInitials = profile?.fullName?.trim()
    ? profile.fullName.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
    : accountName.slice(0, 1).toUpperCase();

  useEffect(() => {
    try {
      const key = 'accesslens-app-navigation';
      const saved = JSON.parse(window.sessionStorage.getItem(key) ?? '[]') as string[];
      const history = saved.filter((path) => navigation.some(({ href }) => path === href || path.startsWith(`${href}/`)));
      if (history.at(-1) !== pathname) {
        history.push(pathname);
        window.sessionStorage.setItem(key, JSON.stringify(history.slice(-30)));
      }
    } catch {
      // Back navigation falls back to the dashboard when browser storage is unavailable.
    }
  }, [pathname]);

  useEffect(() => {
    let active = true;
    apiRequest<ProfileSummary>('/api/profile')
      .then((data) => {
        if (active) setProfile(data);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Could not load your profile.');
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const loadUnread = () => {
      apiRequest<{ unread: number }>('/api/notifications?page=1&pageSize=1')
        .then((result) => { if (active) setUnreadNotifications(result.unread); })
        .catch(() => { if (active) setUnreadNotifications(0); });
    };
    loadUnread();
    const timer = window.setInterval(loadUnread, 60_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [pathname]);

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) throw signOutError;
      window.location.replace('/login');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not sign out.');
      setSigningOut(false);
    }
  }

  function goBack() {
    const key = 'accesslens-app-navigation';
    try {
      const saved = JSON.parse(window.sessionStorage.getItem(key) ?? '[]') as string[];
      const history = saved.filter((path) => navigation.some(({ href }) => path === href || path.startsWith(`${href}/`)));
      if (history.at(-1) !== pathname) history.push(pathname);
      if (history.length > 1) {
        history.pop();
        const previous = history.at(-1);
        window.sessionStorage.setItem(key, JSON.stringify(history));
        if (previous) {
          router.push(previous);
          return;
        }
      }
    } catch {
      // Use the dashboard fallback below.
    }
    router.push('/dashboard');
  }

  return (
    <div className="app-frame">
      <aside className="sidebar">
        <Link className="brand-lockup sidebar-brand" href="/dashboard">
          <span className="brand-mark" aria-hidden="true">A</span>
          <span>AccessLens <strong>AI</strong></span>
        </Link>
        <div className="workspace-label">WORKSPACE</div>
        <nav aria-label="Main navigation" className="sidebar-nav">
          {navigation.map(({ label, href, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                aria-current={active ? 'page' : undefined}
                className={`nav-link${active ? ' nav-link-active' : ''}`}
                href={href}
                key={href}
              >
                <Icon aria-hidden="true" size={18} />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-help"><LifeBuoy size={17} /> Accessibility hub</div>
          <div className="sidebar-user">
            <div className="avatar" aria-hidden="true">
              {(profile?.fullName ?? profile?.email ?? 'A').slice(0, 1).toUpperCase()}
            </div>
            <div className="user-copy">
              <strong>{profile?.fullName || 'Your account'}</strong>
              <span>{profile?.email ?? 'Loading profile…'}</span>
            </div>
            <button aria-label={signingOut ? 'Signing out' : 'Sign out'} className="icon-button" disabled={signingOut} onClick={signOut} title={signingOut ? 'Signing out' : 'Sign out'}>
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-column">
        <header className="topbar">
          <div className="topbar-leading">
            <button aria-label="Go back to the previous page" className="back-button" onClick={goBack} type="button">
              <ArrowLeft aria-hidden="true" size={16} /><span>Back</span>
            </button>
            <div className="topbar-context">
              <Shield size={16} aria-hidden="true" />
              <span>Accessibility workspace</span>
            </div>
          </div>
          <div className="topbar-actions">
            {error && <span className="topbar-error" role="status">{error}</span>}
            <ThemeToggle />
            <Link aria-label={`Notifications${unreadNotifications ? `, ${unreadNotifications} unread` : ''}`} className="notification-bell" href="/notifications" title="Notifications">
              <Bell aria-hidden="true" size={18} />
              {unreadNotifications > 0 && <span className="notification-badge">{unreadNotifications > 99 ? '99+' : unreadNotifications}</span>}
            </Link>
            <Link aria-label={`Account settings for ${accountName}`} className="topbar-avatar" href="/settings" title={accountName}>
              {avatarInitials}
            </Link>
            <button aria-label={signingOut ? 'Signing out' : 'Sign out'} className="icon-button" disabled={signingOut} onClick={signOut} title={signingOut ? 'Signing out' : 'Sign out'}>
              <LogOut size={17} />
            </button>
          </div>
        </header>
        <main className="main-content">{children}</main>
      </div>
    </div>
  );
}
