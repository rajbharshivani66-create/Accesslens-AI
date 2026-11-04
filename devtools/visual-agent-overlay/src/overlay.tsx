export type SelectionContext = {
  tag: string;
  selector: string;
  classes: string[];
  attributes: Record<string, string>;
  pageUrl: string;
  viewport: { width: number; height: number };
  instructions: string[];
};

export function VisualAgentOverlay() {
  const selection: SelectionContext = {
    tag: 'button',
    selector: 'button[data-ui="primary-cta"]',
    classes: ['cta', 'primary', 'rounded'],
    attributes: { type: 'button', 'data-ui': 'primary-cta' },
    pageUrl: 'https://localhost:3000',
    viewport: { width: 1440, height: 900 },
    instructions: [
      'Make this button match the primary brand palette.',
      'Increase spacing and improve mobile readability.'
    ]
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 16,
        right: 16,
        zIndex: 99999,
        width: 320,
        borderRadius: 16,
        border: '1px solid rgba(148,163,184,0.4)',
        background: 'rgba(15, 23, 42, 0.95)',
        color: '#f8fafc',
        padding: 16,
        boxShadow: '0 24px 60px rgba(15, 23, 42, 0.45)'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <strong>ACCESSLENS VISUAL AGENT</strong>
        <span style={{ color: '#67e8f9', fontSize: 12 }}>DEV</span>
      </div>
      <div style={{ fontSize: 12, lineHeight: 1.6, color: '#cbd5e1' }}>
        <div>Selected: {selection.tag}</div>
        <div>Selector: {selection.selector}</div>
        <div>Classes: {selection.classes.join(', ')}</div>
        <div>Viewport: {selection.viewport.width}x{selection.viewport.height}</div>
      </div>
      <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(148,163,184,0.25)' }}>
        <div style={{ fontSize: 12, color: '#a5f3fc', marginBottom: 8 }}>Agent prompt</div>
        <textarea
          readOnly
          value={selection.instructions.join('\n')}
          style={{
            width: '100%',
            minHeight: 100,
            borderRadius: 8,
            border: '1px solid rgba(148,163,184,0.35)',
            background: '#0f172a',
            color: '#e2e8f0',
            resize: 'vertical',
            padding: 8
          }}
        />
      </div>
    </div>
  );
}
