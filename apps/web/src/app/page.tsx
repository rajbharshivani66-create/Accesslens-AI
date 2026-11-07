import Link from 'next/link';
import { ThemeToggle } from '@/components/app-shell/theme-toggle';
import { Activity, ArrowDownRight, ArrowRight, Check, CircleHelp, Eye, ScanSearch, ShieldCheck, Sparkles, WandSparkles } from 'lucide-react';

const features = [
  {
    icon: ScanSearch,
    title: 'Scan real pages',
    description: 'Run accessibility checks on a website and keep each scan attached to its project.',
    tone: 'cyan'
  },
  {
    icon: Eye,
    title: 'Understand findings',
    description: 'Review issues by impact, affected element, and relevant WCAG guidance.',
    tone: 'violet'
  },
  {
    icon: Activity,
    title: 'Track improvements',
    description: 'Recheck changes and follow issue history with your team in one workspace.',
    tone: 'green'
  }
];

export default function HomePage() {
  return (
    <main className="landing-page">
      <div className="landing-glow landing-glow-one" aria-hidden="true" />
      <div className="landing-glow landing-glow-two" aria-hidden="true" />

      <header className="landing-nav">
        <Link href="/" className="landing-brand" aria-label="AccessLens AI home">
          <span className="landing-brand-mark"><Eye size={19} strokeWidth={2.5} /></span>
          <span>accesslens<span className="brand-ai">.ai</span></span>
        </Link>
        <nav className="landing-nav-links" aria-label="Main navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#features">Features</a>
          <a href="#why-accesslens">Why AccessLens</a>
          <a href="#faq">FAQ</a>
        </nav>
        <div className="landing-nav-actions">
          <ThemeToggle className="landing-theme-toggle" />
          <Link className="landing-login" href="/login">Log in</Link>
          <Link className="landing-nav-cta" href="/register">Get started <ArrowRight size={15} /></Link>
        </div>
      </header>

      <section className="landing-hero">
        <div className="landing-hero-copy">
          <div className="landing-eyebrow"><span className="eyebrow-pulse" /> ACCESSIBILITY, MADE ACTIONABLE</div>
          <h1>Build a web<br />that works for <span>everyone.</span></h1>
          <p className="landing-lede">Find accessibility barriers, understand what to fix, and help your team make every experience more inclusive.</p>
          <div className="landing-hero-actions">
            <Link className="landing-primary-button" href="/register">Start your first scan <ArrowRight size={17} /></Link>
            <a className="landing-secondary-button" href="#how-it-works">See how it works <ArrowDownRight size={17} /></a>
          </div>
          <div className="landing-proof"><span className="proof-icon"><ShieldCheck size={16} /></span><span>Built for thoughtful, team-based accessibility work</span></div>
        </div>

        <div className="landing-preview-wrap" aria-label="Illustration of an accessibility scan report">
          <div className="preview-orbit orbit-one" aria-hidden="true" />
          <div className="preview-orbit orbit-two" aria-hidden="true" />
          <div className="scan-preview">
            <div className="preview-topbar">
              <div className="preview-brand"><span className="preview-brand-mark"><Eye size={13} /></span> AccessLens <span className="preview-separator">/</span> Overview</div>
              <div className="preview-dots" aria-hidden="true"><i /><i /><i /></div>
            </div>
            <div className="preview-content">
              <div className="preview-heading-row"><div><div className="preview-kicker">PROJECT SCAN</div><h2>northstar.design</h2></div><span className="preview-status"><span /> Scan complete</span></div>
              <div className="preview-score-row"><div className="preview-score"><strong>82</strong><span>/ 100</span></div><div className="preview-score-copy"><b>Good progress</b><span>There are still opportunities to improve.</span></div><div className="preview-trend"><Activity size={15} /> <span>+12%</span></div></div>
              <div className="preview-chart" aria-label="Illustrative scan trend"><div className="chart-labels"><span>Accessibility score</span><span>Last 6 scans</span></div><div className="chart-grid"><svg viewBox="0 0 520 110" role="img" aria-label="Illustrative upward trend line" preserveAspectRatio="none"><defs><linearGradient id="chart-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#68e4d3" stopOpacity=".23"/><stop offset="100%" stopColor="#68e4d3" stopOpacity="0"/></linearGradient></defs><path d="M0 82 C38 77 53 79 80 67 S128 72 157 58 S209 63 237 45 S284 58 315 38 S363 47 395 32 S449 36 520 12 L520 110 L0 110Z" fill="url(#chart-fill)"/><path d="M0 82 C38 77 53 79 80 67 S128 72 157 58 S209 63 237 45 S284 58 315 38 S363 47 395 32 S449 36 520 12" fill="none" stroke="#68e4d3" strokeWidth="2.5"/><circle cx="520" cy="12" r="4" fill="#68e4d3" stroke="#0b1720" strokeWidth="3"/></svg></div><div className="chart-months"><span>JUN 02</span><span>JUN 09</span><span>JUN 16</span><span>JUN 23</span><span>JUN 30</span></div></div>
              <div className="preview-findings-head"><b>Issues to review</b><span>View all <ArrowRight size={12} /></span></div>
              <div className="preview-finding"><span className="finding-indicator finding-critical" /><span className="finding-title">Images missing text alternatives</span><span className="finding-count">4 elements</span><span className="finding-arrow"><ArrowRight size={14} /></span></div>
              <div className="preview-finding"><span className="finding-indicator finding-serious" /><span className="finding-title">Form fields need labels</span><span className="finding-count">2 elements</span><span className="finding-arrow"><ArrowRight size={14} /></span></div>
              <div className="preview-finding"><span className="finding-indicator finding-moderate" /><span className="finding-title">Improve color contrast</span><span className="finding-count">7 elements</span><span className="finding-arrow"><ArrowRight size={14} /></span></div>
            </div>
          </div>
          <div className="preview-floating-card"><span className="floating-check"><Check size={16} /></span><span><b>One step at a time</b><small>Clear findings for your team</small></span></div>
        </div>
      </section>

      <section className="landing-trust" aria-label="Product principles">
        <span>Accessibility is a practice, not a checkbox.</span>
        <div className="trust-divider" />
        <span><ShieldCheck size={15} /> WCAG-informed checks</span>
        <span><CircleHelp size={15} /> Human review still matters</span>
        <span><WandSparkles size={15} /> Helpful AI, with you in control</span>
      </section>

      <section className="landing-features" id="features">
        <div className="section-heading"><div><div className="landing-eyebrow">A CLEARER PATH TO ACCESSIBILITY</div><h2>From first scan to lasting progress.</h2></div><p>Turn technical findings into focused work your whole team can understand and move forward.</p></div>
        <div className="feature-grid">{features.map(({ icon: Icon, title, description, tone }, index) => <article className="feature-card" key={title}><div className={`feature-icon feature-${tone}`}><Icon size={21} /></div><span className="feature-number">0{index + 1}</span><h3>{title}</h3><p>{description}</p></article>)}</div>
      </section>

      <section className="landing-how" id="how-it-works">
        <div className="how-copy"><div className="landing-eyebrow">A PRACTICAL WORKFLOW</div><h2>Make the next right fix.</h2><p>AccessLens helps your team move from a URL to an informed, trackable accessibility review.</p><Link className="landing-text-link" href="/register">Explore your workspace <ArrowRight size={16} /></Link></div>
        <div className="how-steps"><div className="how-step"><span className="step-index">01</span><div><h3>Scan a page</h3><p>Start with a website and see what automated checks can identify.</p></div><span className="step-symbol"><ScanSearch size={17} /></span></div><div className="how-step"><span className="step-index">02</span><div><h3>Review the context</h3><p>Understand the impact, affected elements, and relevant accessibility guidance.</p></div><span className="step-symbol"><CircleHelp size={17} /></span></div><div className="how-step"><span className="step-index">03</span><div><h3>Improve together</h3><p>Prioritize changes with your team and verify progress with another scan.</p></div><span className="step-symbol"><Sparkles size={17} /></span></div></div>
      </section>

      <section className="landing-why" id="why-accesslens">
        <div className="landing-section-heading"><div className="landing-eyebrow">WHY ACCESSLENS</div><h2>Clear evidence. Practical next steps.</h2><p>Accessibility work is easier to sustain when teams can see what matters and track what changed.</p></div>
        <div className="why-grid">
          <article className="why-card"><span>01</span><h3>Start with real scans</h3><p>Run checks against saved project pages and keep results tied to the site your team is improving.</p></article>
          <article className="why-card"><span>02</span><h3>Understand the impact</h3><p>Review severity, affected pages, and WCAG context so developers can prioritize informed fixes.</p></article>
          <article className="why-card"><span>03</span><h3>Keep people in control</h3><p>AI suggestions are guidance for human review. Nothing is applied to your code automatically.</p></article>
        </div>
      </section>

      <section className="landing-faq" id="faq">
        <div className="landing-section-heading"><div className="landing-eyebrow">FREQUENTLY ASKED QUESTIONS</div><h2>Good to know before your first scan.</h2></div>
        <div className="faq-list">
          <details><summary>Does an automated scan prove WCAG compliance?</summary><p>No. Automated checks detect only some accessibility issues. A human review and assistive-technology testing are still important.</p></details>
          <details><summary>Can AccessLens change my website automatically?</summary><p>No. Fix suggestions are examples for a developer to review, adapt, and test in the source project.</p></details>
          <details><summary>How do I get findings into the workspace?</summary><p>Create a project, add its website URL, then run a scan. Findings and project filters populate from saved scan results.</p></details>
          <details><summary>Can my team share projects?</summary><p>Yes. Create a team, invite members, and assign projects according to each member’s role.</p></details>
        </div>
      </section>

      <section className="landing-cta"><div className="cta-glow" aria-hidden="true" /><div className="landing-eyebrow">BETTER EXPERIENCES START WITH A FIRST STEP</div><h2>Make your next website<br />more inclusive.</h2><p>Bring your team together around clearer accessibility work.</p><Link className="landing-primary-button" href="/register">Get started with AccessLens <ArrowRight size={17} /></Link></section>

      <footer className="landing-footer"><Link href="/" className="landing-brand"><span className="landing-brand-mark"><Eye size={17} strokeWidth={2.5} /></span><span>accesslens<span className="brand-ai">.ai</span></span></Link><span>Accessibility is better when we build it together.</span><div><Link href="/login">Log in</Link><Link href="/register">Create account</Link></div></footer>
    </main>
  );
}
