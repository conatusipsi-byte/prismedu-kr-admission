/**
 * WebAudio synthesized confirmation chime.
 *
 * 외부 mp3/wav 없이 코드로 합성 — 번들 비용 0, 사용자 설정으로 ON/OFF.
 *
 * 사운드 디자인 원칙:
 *   - 조용함 (0.08~0.15 gain) — 자극 최소화
 *   - 짧음 (200~400ms) — 작업 흐름 방해 없음
 *   - 화성적 (perfect 5th, major 3rd) — 긍정적 톤
 *
 * 기본 OFF (사용자가 설정에서 명시 ON 필요).
 */

let userOptIn = false;
if (typeof window !== "undefined") {
  try {
    userOptIn = localStorage.getItem("prism_chime") === "on";
  } catch {}
}

export function setChimeEnabled(on: boolean) {
  userOptIn = on;
  try { localStorage.setItem("prism_chime", on ? "on" : "off"); } catch {}
}
export function isChimeEnabled() {
  return userOptIn;
}

let ctxSingleton: AudioContext | null = null;
function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctxSingleton) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    try { ctxSingleton = new AC(); } catch { return null; }
  }
  // 일부 브라우저는 user gesture 후에야 resume됨 — 호출자가 user click에 묶어 호출하면 OK.
  if (ctxSingleton.state === "suspended") {
    ctxSingleton.resume().catch(() => {});
  }
  return ctxSingleton;
}

/**
 * 단일 톤 재생.
 *   freq: Hz, dur: seconds, type: oscillator wave
 */
function tone(ctx: AudioContext, freq: number, dur: number, delay: number, gain: number, type: OscillatorType = "sine") {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  // ADSR-ish — quick attack, exponential decay
  g.gain.setValueAtTime(0.0001, ctx.currentTime + delay);
  g.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + delay + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + delay + dur);
  osc.connect(g).connect(ctx.destination);
  osc.start(ctx.currentTime + delay);
  osc.stop(ctx.currentTime + delay + dur + 0.05);
}

export type ChimeKind = "success" | "complete" | "error";

/**
 * 명시적 사용자 액션(완료/결제 등)에 호출.
 *   chime("success") — 짧은 두 음 상승 (D5 → A5)
 *   chime("complete") — 3음 화음 (C5 + E5 + G5)
 *   chime("error") — 단음 dissonant (C#4)
 */
export function chime(kind: ChimeKind = "success") {
  if (!userOptIn) return;
  const ctx = getCtx();
  if (!ctx) return;

  switch (kind) {
    case "success":
      tone(ctx, 587.33, 0.18, 0,    0.12, "sine"); // D5
      tone(ctx, 880.00, 0.22, 0.08, 0.10, "sine"); // A5 (perfect 5th up)
      break;
    case "complete":
      tone(ctx, 523.25, 0.30, 0,    0.10, "sine"); // C5
      tone(ctx, 659.25, 0.30, 0,    0.08, "sine"); // E5 (major 3rd)
      tone(ctx, 783.99, 0.32, 0,    0.07, "sine"); // G5 (perfect 5th)
      break;
    case "error":
      tone(ctx, 277.18, 0.20, 0,    0.10, "triangle"); // C#4 minor feel
      break;
  }
}
