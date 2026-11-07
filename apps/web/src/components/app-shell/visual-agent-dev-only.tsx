'use client';

import { useEffect, useState, type ComponentType } from 'react';

type OverlayProps = Record<string, never>;

export function VisualAgentDevOnly() {
  const enabled = process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_VISUAL_AGENT_ENABLED === 'true';
  const [Overlay, setOverlay] = useState<ComponentType<OverlayProps> | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    import('@accesslens-ai/visual-agent-overlay').then((module) => {
      if (active) { setOverlay(() => module.VisualAgentOverlay); setLoadFailed(false); }
    }).catch(() => { if (active) setLoadFailed(true); });
    return () => { active = false; };
  }, [enabled, attempt]);

  if (!enabled) return null;
  if (Overlay) return <Overlay />;
  if (!loadFailed) return null;

  return <aside role="alert" style={{ position: 'fixed', right: 16, bottom: 16, zIndex: 2147483000, maxWidth: 320, padding: 12, color: '#fff', background: '#7f1d1d', borderRadius: 8 }}>
    Visual Agent failed to load.
    <button type="button" onClick={() => { setOverlay(null); setLoadFailed(false); setAttempt((value) => value + 1); }} style={{ marginLeft: 8 }}>Retry</button>
  </aside>;
}
