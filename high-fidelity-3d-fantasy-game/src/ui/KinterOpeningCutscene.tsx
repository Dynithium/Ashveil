import type { PrologueHud } from "../game/engine";
import { PROLOGUE_BEATS } from "../game/kinterOpening";

function formatClock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${mm}:${ss.toString().padStart(2, "0")}`;
}

/**
 * The authored overlay for "The Long Fall". It owns the presentation of the
 * opening beats (chapter card, objective, subtitles, prompts, progress) while
 * the engine owns the timing. Pointer events pass straight through so the
 * existing F / click and benchmark `interact` input keep working underneath.
 */
export function KinterOpeningCutscene({ p }: { p: PrologueHud | null }) {
  if (!p || !p.active) return null;
  const idx = PROLOGUE_BEATS.findIndex((beat) => beat.id === p.beatId);

  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      {/* cinematic letterbox */}
      <div className="absolute inset-x-0 top-0 bg-black" style={{ height: "5.5%" }} />
      <div className="absolute inset-x-0 bottom-0 bg-black" style={{ height: "7%" }} />

      {/* ---------- chapter card ---------- */}
      <div key={p.beatId} className="anim-fade-up absolute left-1/2 top-[7.5%] -translate-x-1/2 text-center">
        <div className="font-title text-[10px] tracking-[0.55em]" style={{ color: "rgba(226,196,140,0.6)", textShadow: "0 2px 8px #000" }}>
          {p.area.toUpperCase()}
        </div>
        <div className="font-title mt-2 whitespace-nowrap text-[clamp(9px,1.65vw,25px)] tracking-[0.18em] gold-text glow-gold">
          {p.title}
        </div>
      </div>

      {/* ---------- current objective + hint ---------- */}
      <div className="absolute left-1/2 top-[19%] w-[min(82vw,760px)] -translate-x-1/2 text-center">
        <div className="flex items-center justify-center gap-3">
          <svg width="11" height="11" viewBox="0 0 12 12" style={{ filter: "drop-shadow(0 0 7px rgba(255,214,140,0.85))" }}>
            <path d="M6 0 L12 6 L6 12 L0 6 Z" fill="rgba(255,222,152,0.92)" />
          </svg>
          <span className="font-title text-[11px] tracking-[0.24em]" style={{ color: "rgba(232,208,160,0.86)", textShadow: "0 2px 6px #000" }}>
            {p.objective.toUpperCase()}
          </span>
        </div>
        {p.hint && (
          <div className="mt-[6px] text-[13px] italic" style={{ color: "rgba(198,182,152,0.55)", textShadow: "0 2px 6px #000" }}>
            {p.hint}
          </div>
        )}
      </div>

      {/* ---------- narration / dialogue subtitle ---------- */}
      {p.subtitle && (
        <div
          key={p.subtitle.text}
          className="anim-fade-up absolute bottom-[15%] left-1/2 w-[min(88vw,940px)] -translate-x-1/2 text-center"
        >
          <div className="font-title mb-2 text-[11px] tracking-[0.5em] gold-text glow-gold">{p.subtitle.speaker}</div>
          <div
            className="px-6 text-[clamp(15px,1.55vw,22px)] italic leading-relaxed"
            style={{ color: "rgba(236,224,198,0.92)", textShadow: "0 2px 12px #000" }}
          >
            {p.subtitle.text}
          </div>
        </div>
      )}

      {/* ---------- story dialogue (prologue conversations) ---------- */}
      {p.dialogue && (
        <>
          <div className="absolute inset-x-0 bottom-0 h-[46%]" style={{ background: "linear-gradient(180deg, transparent, rgba(2,2,4,0.9))" }} />
          <div className="anim-fade-up pointer-events-none absolute bottom-[13%] left-1/2 w-[min(88vw,860px)] -translate-x-1/2 text-center" key={p.dialogue.idx}>
            <div className="font-title mb-3 text-[13px] tracking-[0.5em] gold-text glow-gold">
              {p.dialogue.speakers?.[p.dialogue.idx] ?? p.dialogue.speaker}
            </div>
            <div
              className="px-8 text-[clamp(17px,1.6vw,23px)] italic leading-relaxed"
              style={{ color: "rgba(238,226,200,0.94)", textShadow: "0 2px 10px #000" }}
            >
              “{p.dialogue.lines[p.dialogue.idx]}”
            </div>
            <div className="mx-auto mt-4 h-px w-[280px]" style={{ background: "linear-gradient(90deg,transparent,rgba(226,196,140,0.5),transparent)" }} />
            <div className="anim-pulse-slow mt-3 font-title text-[10px] tracking-[0.32em]" style={{ color: "rgba(214,188,140,0.6)" }}>
              F / CLICK — CONTINUE · {p.dialogue.idx + 1}/{p.dialogue.lines.length}
            </div>
          </div>
        </>
      )}

      {/* ---------- the one live interaction prompt ---------- */}
      {p.prompt && (
        <div key={p.prompt} className="anim-pulse-slow absolute bottom-[27%] left-1/2 -translate-x-1/2 text-center">
          <div
            className="px-7 py-2 font-title text-[13px] tracking-[0.28em]"
            style={{
              color: "#f4e4bd",
              background: "linear-gradient(90deg, transparent, rgba(10,8,6,0.74), transparent)",
              textShadow: "0 0 16px rgba(255,200,120,0.6)",
            }}
          >
            {p.prompt}
          </div>
        </div>
      )}

      {/* ---------- sequence progress ---------- */}
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center justify-center gap-[7px]" style={{ height: "7%" }}>
        <div className="flex items-center gap-[6px]">
          {PROLOGUE_BEATS.map((beat, i) => {
            const done = idx >= 0 && i < idx;
            const here = i === idx;
            return (
              <div
                key={beat.id}
                className={here ? "anim-pulse-slow" : undefined}
                style={{
                  width: here ? 26 : 15,
                  height: 2,
                  background: here ? "rgba(255,224,158,0.95)" : done ? "rgba(206,176,120,0.7)" : "rgba(150,134,102,0.28)",
                  boxShadow: here ? "0 0 10px rgba(255,214,140,0.8)" : undefined,
                }}
              />
            );
          })}
        </div>
        <div className="font-title text-[9px] tracking-[0.34em]" style={{ color: "rgba(206,182,132,0.5)" }}>
          THE LONG FALL · {formatClock(p.elapsed)}
        </div>
      </div>

      {/* ---------- fade to black (cuts, waking, falling) ---------- */}
      <div className="absolute inset-0 bg-black" style={{ opacity: p.fade }} />
    </div>
  );
}
