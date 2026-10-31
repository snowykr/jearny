// Injected once by mountUi, so index.html stays free of gameplay styling.
export const UI_STYLES = `
/* One compact chip: money, objective, two small buttons and the one-line legal
   notice. The full note expands on its own line inside the chip, so it stays
   clear of the dialogue box even though the chip floats over the field. */
.jq-hud { position: absolute; top: 8px; left: 8px; display: flex; flex-wrap: wrap; align-items: center;
  gap: 2px 6px; padding: 3px 6px; border-radius: 6px; background: rgba(12, 14, 22, .82); color: #f4f1e8;
  font: 11px/1.35 system-ui, sans-serif; pointer-events: none; box-sizing: border-box;
  max-width: min(260px, calc(100vw - 128px)); max-height: calc(100vh - 16px); overflow-y: auto; }
.jq-hud button { pointer-events: auto; flex: 0 0 auto; display: inline-flex; align-items: center;
  justify-content: center; min-height: 24px; font: inherit; line-height: 1.35; padding: 1px 6px;
  border-radius: 4px; border: 1px solid #8b8f9a; background: #232636; color: inherit; cursor: pointer; }
.jq-wallet { opacity: .9; white-space: nowrap; font-weight: 700; letter-spacing: .02em; }
/* The 140px basis keeps the objective on a readable line: narrower than that it
   wraps onto its own row instead of collapsing to one glyph per line. */
.jq-objective { display: flex; flex-direction: column; flex: 1 1 140px; min-width: 0; }
.jq-quest-en { opacity: .7; font-size: .9em; }
/* The one-line notice stays on screen; the full text below is opt-in. */
.jq-disclaimer-short { flex: 1 0 100%; margin: 0; padding-top: 2px; border-top: 1px solid rgba(139, 143, 154, .45);
  font-size: 9px; line-height: 1.3; opacity: .75; }
.jq-disclaimer { flex: 1 0 100%; padding-top: 3px; border-top: 1px solid rgba(139, 143, 154, .45);
  font-size: 10px; line-height: 1.45; opacity: .8; max-height: min(140px, 34vh); overflow-y: auto; }
.jq-disclaimer[hidden] { display: none; }
/* Expanded, the note is the only scrollable part of the chip; the rest stays
   click-through. */
.jq-disclaimer:not([hidden]) { pointer-events: auto; }
/* Below a 320px viewport the chip would wrap into three rows; drop the English
   objective line there, the Japanese line already names the task. */
@media (max-width: 319px) { .jq-quest-en { display: none; } .jq-hud { font-size: 10px; } }
/* Handheld/short viewports (240x160): keep the chip in the free top strip. It
   must stay left of the minimap and above the touch D-pad, so the rows are
   ordered explicitly instead of relying on DOM order. */
@media (max-height: 220px) {
  /* 52px column keeps both buttons left of the touch D-pad's up cell (x=68 at
     240px wide); the objective uses the right column and spans the button rows. */
  .jq-hud { display: grid; grid-template-columns: 52px minmax(0, 1fr); align-items: center;
    max-width: min(120px, calc(100vw - 128px)); max-height: 88px; font-size: 10px;
    gap: 1px 4px; padding: 2px 4px; }
  .jq-hud button { min-height: 18px; padding: 0 4px; width: 100%; }
  .jq-wallet { grid-column: 1; grid-row: 1; }
  .jq-hud-note { grid-column: 1; grid-row: 2; }
  .jq-hud-settings { grid-column: 1; grid-row: 3; }
  .jq-objective { grid-column: 2; grid-row: 1 / span 3; }
  .jq-quest-en { display: none; }
  .jq-disclaimer-short { grid-column: 1 / -1; grid-row: 4; font-size: 8px; line-height: 1.2; padding-top: 1px; }
  .jq-disclaimer { grid-column: 1 / -1; grid-row: 5; font-size: 9px; max-height: 16px; }
}
.jq-disclaimer-ja, .jq-disclaimer-en { display: block; }
.jq-disclaimer-en { margin-top: 2px; font-size: .95em; }

.jq-dialogue { position: absolute; left: 50%; bottom: 12px; transform: translateX(-50%);
  width: min(560px, calc(100vw - 24px)); padding: 10px 14px 14px; border-radius: 8px;
  border: 2px solid #d8d2c0; background: rgba(16, 20, 32, .94); color: #f7f3e6;
  font: 14px/1.7 system-ui, sans-serif; box-shadow: 0 8px 28px rgba(0,0,0,.45); }
.jq-dialogue[hidden] { display: none; }
.jq-speaker { font-weight: 700; font-size: 12px; letter-spacing: .08em; color: #ffd479; margin-bottom: 2px; }
.jq-text { margin: 0; white-space: pre-wrap; line-break: strict; word-break: keep-all; min-height: 3.4em; }
.jq-choices { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.jq-choice { font: inherit; padding: 6px 10px; border-radius: 6px; cursor: pointer;
  border: 1px solid #7c8294; background: #1b1f2c; color: #f7f3e6; }
.jq-choice[aria-current="true"] { border-color: #ffd479; background: #2f3550; }
.jq-choice:disabled { opacity: .45; cursor: not-allowed; }
.jq-cue { display: block; text-align: right; color: #ffd479; font-size: 12px; }
.jq-cue[hidden] { visibility: hidden; }
.jq-replay { margin-top: 6px; font: 11px system-ui, sans-serif; padding: 2px 8px;
  border-radius: 4px; border: 1px solid #7c8294; background: #1b1f2c; color: #d8d2c0; cursor: pointer; }
.jq-replay[hidden] { display: none; }
.jq-toast { position: absolute; left: 50%; top: 16px; transform: translateX(-50%);
  padding: 6px 12px; border-radius: 999px; background: rgba(12, 14, 22, .92); color: #ffe9b0;
  font: 13px system-ui, sans-serif; border: 1px solid #6b6f7d; }
.jq-toast[hidden] { display: none; }

.jq-settings { position: absolute; top: 8px; right: 8px; width: 220px; padding: 10px 12px;
  border-radius: 8px; background: rgba(16, 20, 32, .96); color: #f4f1e8; border: 1px solid #6b6f7d;
  font: 12px/1.7 system-ui, sans-serif; }
.jq-settings[hidden] { display: none; }
.jq-settings label { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 4px 0; }
.jq-settings select, .jq-settings input[type="range"] { max-width: 110px; }

.jq-modal { position: absolute; inset: 0; display: grid; place-items: center;
  background: rgba(6, 8, 14, .72); }
.jq-modal[hidden] { display: none; }
.jq-modal-card { width: min(420px, calc(100vw - 40px)); padding: 18px 20px; border-radius: 10px;
  background: #141826; color: #f7f3e6; border: 2px solid #ffd479; text-align: center;
  font: 14px/1.7 system-ui, sans-serif; }
.jq-modal-card h2 { margin: 0 0 6px; font-size: 16px; }
.jq-modal-extra:empty { display: none; }
.jq-coupon { margin: 10px 0 2px; padding: 10px 12px; border: 2px dashed #ffd479; border-radius: 8px;
  background: rgba(255, 212, 121, .08); }
.jq-coupon-title { font-size: 12px; font-weight: 700; letter-spacing: .12em; color: #ffd479; }
.jq-coupon-shop { font-size: 16px; font-weight: 700; margin-top: 2px; }
.jq-coupon-note { margin-top: 6px; font-size: 11px; opacity: .85; }
.jq-coupon-en { display: block; margin-top: 2px; }
.jq-modal-card button { margin-top: 12px; font: inherit; padding: 6px 14px; border-radius: 6px;
  border: 1px solid #ffd479; background: #2a2f45; color: inherit; cursor: pointer; }

.jq-sr { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden;
  clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.jq-root-large .jq-dialogue { font-size: 17px; }
.jq-root-large .jq-hud { font-size: 13px; }
.jq-root-large .jq-disclaimer { font-size: 12px; }

/* index.html sets #ui-root > * { pointer-events: auto }; the HUD stays click-through. */
#ui-root > .jq-hud, #ui-root > .jq-toast { pointer-events: none; }
#ui-root > .jq-hud button { pointer-events: auto; }
`;
