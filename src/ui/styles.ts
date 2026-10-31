// Injected once by mountUi, so index.html stays free of gameplay styling.
export const UI_STYLES = `
.jq-hud { position: absolute; top: 8px; left: 8px; display: flex; flex-direction: column; gap: 2px;
  padding: 6px 8px; border-radius: 6px; background: rgba(12, 14, 22, .82); color: #f4f1e8;
  font: 12px/1.5 system-ui, sans-serif; pointer-events: none; max-width: 220px; }
.jq-hud button { pointer-events: auto; margin-top: 4px; font: inherit; padding: 2px 8px;
  border-radius: 4px; border: 1px solid #8b8f9a; background: #232636; color: inherit; cursor: pointer; }
.jq-hud-title { font-weight: 700; letter-spacing: .04em; }
.jq-hud-row { display: flex; gap: 6px; justify-content: space-between; }
.jq-bag { opacity: .85; }

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
.jq-choice[aria-selected="true"] { border-color: #ffd479; background: #2f3550; }
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
.jq-modal-card button { margin-top: 12px; font: inherit; padding: 6px 14px; border-radius: 6px;
  border: 1px solid #ffd479; background: #2a2f45; color: inherit; cursor: pointer; }

.jq-sr { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden;
  clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.jq-root-large .jq-dialogue { font-size: 17px; }
.jq-root-large .jq-hud { font-size: 14px; }
`;
