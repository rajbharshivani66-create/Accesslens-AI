'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

type ConfirmOptions = { title: string; message: string; confirmLabel?: string };
type Pending = ConfirmOptions & { resolve: (confirmed: boolean) => void };
const ConfirmContext = createContext<((options: ConfirmOptions) => Promise<boolean>) | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const pendingRef = useRef<Pending | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const confirm = useCallback((options: ConfirmOptions) => new Promise<boolean>((resolve) => {
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    pendingRef.current?.resolve(false);
    const next = { ...options, resolve };
    pendingRef.current = next;
    setPending(next);
  }), []);
  const finish = useCallback((result: boolean) => {
    pendingRef.current?.resolve(result);
    pendingRef.current = null;
    setPending(null);
    requestAnimationFrame(() => previousFocus.current?.focus());
  }, []);

  useEffect(() => {
    if (!pending) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); finish(false); return; }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const controls = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled])'));
      if (!controls.length) { event.preventDefault(); return; }
      const first = controls[0]; const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    dialogRef.current?.querySelector<HTMLElement>('button')?.focus();
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [pending, finish]);

  return <ConfirmContext.Provider value={confirm}>
    {children}
    {pending && <div className="confirm-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) finish(false); }}>
      <section aria-labelledby="confirm-title" aria-describedby="confirm-message" aria-modal="true" className="confirm-dialog" ref={dialogRef} role="alertdialog" tabIndex={-1}>
        <span aria-hidden="true" className="confirm-mark">!</span>
        <div className="confirm-copy"><h2 id="confirm-title">{pending.title}</h2><p id="confirm-message">{pending.message}</p></div>
        <div className="confirm-actions"><button autoFocus className="button button-secondary" onClick={() => finish(false)} type="button">Cancel</button><button className="button button-danger" onClick={() => finish(true)} type="button">{pending.confirmLabel ?? 'Delete'}</button></div>
      </section>
    </div>}
  </ConfirmContext.Provider>;
}

export function useConfirm() {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error('useConfirm must be used inside ConfirmProvider.');
  return confirm;
}
