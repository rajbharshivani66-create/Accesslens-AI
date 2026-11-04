'use client';

import { CheckCircle2, X, XCircle } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

type ToastKind = 'success' | 'error';

interface ToastMessage {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastContextValue {
  pushToast: (kind: ToastKind, message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const pushToast = useCallback(
    (kind: ToastKind, message: string) => {
      const id = ++nextId.current;
      setToasts((current) => [...current, { id, kind, message }]);
      timers.current.set(id, setTimeout(() => dismiss(id), 4500));
    },
    [dismiss]
  );

  useEffect(
    () => () => {
      timers.current.forEach((timer) => clearTimeout(timer));
      timers.current.clear();
    },
    []
  );

  return (
    <ToastContext.Provider value={{ pushToast }}>
      {children}
      <div aria-label="Notifications" aria-live="polite" className="toast-viewport">
        {toasts.map((toast) => {
          const Icon = toast.kind === 'success' ? CheckCircle2 : XCircle;
          return (
            <div className={`toast toast-${toast.kind}`} key={toast.id} role="status">
              <Icon aria-hidden="true" size={18} />
              <span>{toast.message}</span>
              <button
                aria-label="Dismiss notification"
                className="toast-dismiss"
                onClick={() => dismiss(toast.id)}
                type="button"
              >
                <X size={15} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used inside ToastProvider.');
  }
  return context;
}
