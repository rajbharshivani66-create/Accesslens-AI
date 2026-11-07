import type { ReactNode } from 'react';
import { AppShell } from '@/components/app-shell/app-shell';
import { ConfirmProvider } from '@/components/app-shell/confirm-provider';
import { ToastProvider } from '@/components/app-shell/toast-provider';
import { VisualAgentDevOnly } from '@/components/app-shell/visual-agent-dev-only';

export default function AuthenticatedLayout({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <AppShell>{children}</AppShell>
        <VisualAgentDevOnly />
      </ConfirmProvider>
    </ToastProvider>
  );
}
