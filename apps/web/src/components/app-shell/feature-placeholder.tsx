import { ArrowRight, Construction } from 'lucide-react';
import Link from 'next/link';

export function FeaturePlaceholder({
  title,
  description
}: {
  title: string;
  description: string;
}) {
  return (
    <section className="page-section">
      <div className="page-heading">
        <div>
          <p className="eyebrow">APPLICATION MODULE</p>
          <h1>{title}</h1>
          <p className="muted">{description}</p>
        </div>
      </div>
      <div className="empty-panel">
        <span className="empty-icon"><Construction size={22} /></span>
        <h2>Not available in v1.2.0</h2>
        <p>This module is reserved for a later development phase. No placeholder data or actions are shown here.</p>
        <Link className="text-link" href="/projects">Go to projects <ArrowRight size={16} /></Link>
      </div>
    </section>
  );
}
