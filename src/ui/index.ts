// Track B owns src/ui/. STUB: shows wallet and dialogue status so Track A can see state changes.
import type { GameSession } from '../contracts';

export function mountUi(root: HTMLElement, session: GameSession): () => void {
  const hud = document.createElement('div');
  hud.style.cssText = 'position:absolute;top:8px;left:8px;color:#fff;font:12px monospace;background:#0008;padding:4px 6px;';
  root.append(hud);
  const unsubscribe = session.subscribe((s) => {
    hud.textContent = `¥${s.walletYen} · rev ${s.revision} · ${s.sceneId} · dialogue ${s.dialogue.status}`;
  });
  return () => { unsubscribe(); hud.remove(); };
}
