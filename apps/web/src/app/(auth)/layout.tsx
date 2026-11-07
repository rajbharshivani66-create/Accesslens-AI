import type { ReactNode } from 'react';
import { ThemeToggle } from '@/components/app-shell/theme-toggle';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return <>
    <ThemeToggle className="auth-theme-toggle" />
    {children}
  </>;
}
