'use client';

import { Save } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { apiRequest } from '@/lib/api';
import { useToast } from '@/components/app-shell/toast-provider';

interface Profile {
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
}

export default function SettingsPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [fullName, setFullName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const { pushToast } = useToast();

  const loadProfile = useCallback(() => {
    setLoading(true);
    setError('');
    apiRequest<Profile>('/api/profile')
      .then((result) => {
        setProfile(result);
        setFullName(result.fullName ?? '');
        setAvatarUrl(result.avatarUrl ?? '');
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not load profile.'))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { loadProfile(); }, [loadProfile]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const updated = await apiRequest<Profile>('/api/profile', {
        method: 'PUT',
        body: JSON.stringify({
          fullName: fullName.trim() || null,
          avatarUrl: avatarUrl.trim() || null
        })
      });
      setProfile(updated);
      pushToast('success', 'Profile updated.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update profile.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="page-section">
      <div className="page-heading">
        <div>
          <p className="eyebrow">PREFERENCES</p>
          <h1>Settings</h1>
          <p className="muted">Manage your profile information.</p>
        </div>
      </div>
      {error && <div className="alert alert-error" role="alert">{error}{!profile && !loading && <button className="button button-secondary" onClick={loadProfile} type="button">Retry</button>}</div>}
      <section className="surface-card detail-card">
        <h2>Your profile</h2>
        {loading ? (
          <div aria-live="polite" className="loading-panel">Loading profile…</div>
        ) : profile ? (
          <>
            <p className="muted">Signed in as {profile?.email}</p>
            <form className="form-stack detail-form" onSubmit={saveProfile}>
              <label>
                Full name
                <input maxLength={100} onChange={(event) => setFullName(event.target.value)} value={fullName} />
              </label>
              <label>
                Avatar URL <span className="optional-label">Optional</span>
                <input
                  onChange={(event) => setAvatarUrl(event.target.value)}
                  placeholder="https://example.com/avatar.png"
                  type="url"
                  value={avatarUrl}
                />
              </label>
              <div>
                <button className="button button-primary" disabled={busy} type="submit">
                  <Save size={17} /> {busy ? 'Saving…' : 'Save profile'}
                </button>
              </div>
            </form>
          </>
        ) : <p className="muted">Profile settings could not be loaded. Retry to continue.</p>}
        <p className="muted">Email and password are managed by your sign-in provider. Notification preference controls are not configured for this account.</p>
      </section>
    </section>
  );
}
