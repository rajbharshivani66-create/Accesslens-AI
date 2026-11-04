import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AccessLens AI',
  description: 'AI-powered accessibility intelligence for web teams.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
