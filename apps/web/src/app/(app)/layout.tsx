import type { ReactNode } from 'react';
import { AppShell } from '@/components/app-shell/app-shell';
import { ToastProvider } from '@/components/app-shell/toast-provider';
import { VisualAgentDevOnly } from '@/components/app-shell/visual-agent-dev-only';

export default function AuthenticatedLayout({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <AppShell>{children}</AppShell>
      <VisualAgentDevOnly />
    </ToastProvider>
  );
}
