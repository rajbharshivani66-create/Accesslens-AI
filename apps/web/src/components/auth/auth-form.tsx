'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { createSupabaseBrowserClient, hasSupabaseBrowserConfig } from '@/lib/supabase/browser';

type AuthMode = 'login' | 'register' | 'forgot-password' | 'reset-password';

const headings: Record<AuthMode, { title: string; description: string; button: string }> = {
  login: {
    title: 'Welcome back',
    description: 'Sign in to manage your accessibility work.',
    button: 'Sign in'
  },
  register: {
    title: 'Create your account',
    description: 'Start organizing website accessibility projects.',
    button: 'Create account'
  },
  'forgot-password': {
    title: 'Reset your password',
    description: 'We will send a secure password reset link to your email.',
    button: 'Send reset link'
  },
  'reset-password': {
    title: 'Choose a new password',
    description: 'Set a new password for your AccessLens AI account.',
    button: 'Update password'
  }
};

export function AuthForm({ mode, nextPath, authError }: { mode: AuthMode; nextPath?: string; authError?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const configured = hasSupabaseBrowserConfig();
  const heading = headings[mode];

  const callbackMessage = authError === 'invalid-link'
    ? 'This confirmation link is incomplete. Request a new link and open it on the same AccessLens site where you signed up.'
    : authError === 'link-expired'
      ? 'This confirmation link has expired or was already used. Sign in or request a fresh confirmation link.'
      : '';

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');
    setBusy(true);

    try {
      const supabase = createSupabaseBrowserClient();

      if (mode === 'register') {
        const { data, error: authError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName.trim() },
            emailRedirectTo: `${window.location.origin}/auth/callback?next=/dashboard`
          }
        });
        if (authError) throw authError;

        if (data.session) {
          router.replace('/dashboard');
          router.refresh();
        } else {
          setMessage('Check your email to confirm your account, then sign in.');
        }
      } else if (mode === 'login') {
        const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
        if (authError) throw authError;

        const destination =
          nextPath?.startsWith('/') && !nextPath.startsWith('//') ? nextPath : '/dashboard';
        router.replace(destination);
        router.refresh();
      } else if (mode === 'forgot-password') {
        const { error: authError } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`
        });
        if (authError) throw authError;
        setMessage('If an account exists for that email, a reset link has been sent.');
      } else {
        const { error: authError } = await supabase.auth.updateUser({ password });
        if (authError) throw authError;
        setMessage('Your password has been updated. You can now sign in.');
        router.replace('/dashboard');
        router.refresh();
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Authentication request failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="auth-heading">
        <Link className="brand-lockup" href="/">
          <span className="brand-mark" aria-hidden="true">A</span>
          <span>AccessLens <strong>AI</strong></span>
        </Link>
        <h1 id="auth-heading">{heading.title}</h1>
        <p className="muted">{heading.description}</p>

        {!configured && (
          <div className="alert alert-error" role="alert">
            Authentication is not configured. Set the Supabase URL and anon key in the web app environment.
          </div>
        )}
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        {callbackMessage && <div className="alert alert-error" role="alert">{callbackMessage}</div>}
        {message && <div className="alert alert-success" role="status">{message}</div>}

        <form className="form-stack" onSubmit={handleSubmit}>
          {mode === 'register' && (
            <label>
              Full name
              <input
                autoComplete="name"
                maxLength={100}
                onChange={(event) => setFullName(event.target.value)}
                required
                value={fullName}
              />
            </label>
          )}
          {mode !== 'reset-password' && (
            <label>
              Email address
              <input
                autoComplete="email"
                onChange={(event) => setEmail(event.target.value)}
                required
                type="email"
                value={email}
              />
            </label>
          )}
          {(mode === 'login' || mode === 'register' || mode === 'reset-password') && (
            <label>
              {mode === 'reset-password' ? 'New password' : 'Password'}
              <input
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                minLength={8}
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
            </label>
          )}
          <button className="button button-primary button-full" disabled={busy || !configured} type="submit">
            {busy ? 'Please wait…' : heading.button}
          </button>
        </form>

        <div className="auth-links">
          {mode === 'login' && (
            <>
              <Link href="/forgot-password">Forgot password?</Link>
              <span>New here? <Link href="/register">Create an account</Link></span>
            </>
          )}
          {mode === 'register' && <span>Already registered? <Link href="/login">Sign in</Link></span>}
          {mode === 'forgot-password' && <Link href="/login">Back to sign in</Link>}
          {mode === 'reset-password' && <Link href="/login">Back to sign in</Link>}
        </div>
      </section>
    </main>
  );
}
