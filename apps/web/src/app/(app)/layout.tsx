import type { ReactNode } from 'react';
import { AppShell } from '@/components/app-shell/app-shell';
import { ToastProvider } from '@/components/app-shell/toast-provider';

export default function AuthenticatedLayout({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <AppShell>{children}</AppShell>
    </ToastProvider>
  );
}
