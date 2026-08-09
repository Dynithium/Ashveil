import { useMemo, useState } from "react";
import { QUALITY_PRESETS, QUALITY_ORDER, type QualityLevel } from "../game/engine";

const CONTROLS: [string, string][] = [
  ["W A S D", "Move"],
  ["Mouse", "Look / Camera"],
  ["Shift", "Sprint"],
  ["Space", "Dodge Roll · i-frames"],
  ["Left Click", "Light Attack (3-hit chain)"],
  ["E", "Heavy Attack · breaks poise"],
  ["Right Click (hold)", "Guard · tap to Parry"],
  ["Q", "Cast — Sundered Bolt"],
  ["R", "Sacred Flask (heal)"],
  ["1 / 2 / 3", "Greatsword · Twin Blades · Halberd"],
  ["Tab / T / V / Middle Click", "Lock On / Off — works even without pointer lock"],
  ["M", "World Map · Fast Travel"],
  ["F", "Talk · Rest at Grace · Read Stones"],
  ["Esc", "Pause"],
];

function Embers({ n = 46 }: { n?: number }) {
  const seeds = useMemo(
    () =>
      Array.from({ length: n }, () => ({
        left: Math.random() * 100,
        size: 1 + Math.random() * 3.4,
        dur: 7 + Math.random() * 12,
        delay: -Math.random() * 18,
        dx: (Math.random() - 0.5) * 180,
        op: 0.25 + Math.random() * 0.65,
      })),
    [n],
  );
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {seeds.map((s, i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            left: `${s.left}%`,
            bottom: -20,
            width: s.size,
            height: s.size,
            borderRadius: "50%",
            background: "radial-gradient(circle,#fff0c4,#ff9c3c 55%,rgba(255,120,40,0))",
            boxShadow: "0 0 10px rgba(255,170,70,0.9)",
            opacity: s.op,
            ["--dx" as any]: `${s.dx}px`,
            animation: `emberFloat ${s.dur}s linear ${s.delay}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

function Ornament({ flip = false }: { flip?: boolean }) {
  return (
    <svg width="240" height="16" viewBox="0 0 240 16" style={{ transform: flip ? "scaleY(-1)" : undefined }}>
      <g stroke="rgba(226,196,140,0.65)" fill="none" strokeWidth="1">
        <path d="M0 8 H92" />
        <path d="M148 8 H240" />
        <path d="M120 2 L128 8 L120 14 L112 8 Z" fill="rgba(226,196,140,0.35)" />
        <path d="M96 8 L108 8 M132 8 L144 8" />
      </g>
    </svg>
  );
}

function MenuButton({ label, onClick, primary }: { label: string; onClick: () => void; primary?: boolean }) {
  const [h, setH] = useState(false);
  return (
    <button
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      onClick={onClick}
      className="group relative block w-full py-[10px] font-title transition-all duration-300"
      style={{
        fontSize: primary ? 19 : 15,
        letterSpacing: h ? "0.44em" : "0.34em",
        color: h ? "#fff4d8" : primary ? "rgba(232,208,158,0.92)" : "rgba(200,178,138,0.6)",
        textShadow: h ? "0 0 26px rgba(255,200,110,0.85)" : "0 2px 8px rgba(0,0,0,0.8)",
      }}
    >
      <span
        className="absolute left-1/2 top-1/2 -z-10 h-[46px] w-[112%] -translate-x-1/2 -translate-y-1/2 transition-opacity duration-300"
        style={{
          opacity: h ? 1 : 0,
          background: "radial-gradient(ellipse at center, rgba(255,190,100,0.16), transparent 70%)",
        }}
      />
      {label}
      <span
        className="absolute bottom-[2px] left-1/2 h-px -translate-x-1/2 transition-all duration-500"
        style={{ width: h ? "78%" : "0%", background: "linear-gradient(90deg,transparent,rgba(255,220,160,0.9),transparent)" }}
      />
    </button>
  );
}

function QualitySelector({
  current,
  onSet,
}: {
  current: QualityLevel;
  onSet: (q: QualityLevel) => void;
}) {
  return (
    <div className="mt-4 p-4 text-left" style={{ border: "1px solid rgba(196,164,102,0.18)", background: "rgba(0,0,0,0.35)" }}>
      <div className="font-title mb-3 text-[11px] tracking-[0.32em]" style={{ color: "rgba(226,196,140,0.7)" }}>
        VISUAL FIDELITY — {QUALITY_PRESETS[current].label} · {QUALITY_PRESETS[current].short}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
        {QUALITY_ORDER.map((q) => {
          const p = QUALITY_PRESETS[q];
          const active = q === current;
          return (
            <button
              key={q}
              onClick={() => onSet(q)}
              className="group relative p-[10px] text-left transition-all duration-300"
              style={{
                border: active ? "1px solid rgba(255,220,150,0.7)" : "1px solid rgba(180,150,100,0.14)",
                background: active
                  ? "linear-gradient(180deg, rgba(70,45,20,0.7), rgba(30,18,8,0.8))"
                  : "linear-gradient(180deg, rgba(18,14,10,0.6), rgba(8,6,5,0.7))",
                boxShadow: active ? "0 0 18px rgba(255,180,90,0.35), inset 0 0 20px rgba(255,200,120,0.08)" : "none",
              }}
            >
              <div className="font-title text-[11px] tracking-[0.22em]" style={{ color: active ? "#ffe9b0" : "rgba(200,178,138,0.7)" }}>
                {p.label}
              </div>
              <div className="mt-1 text-[9px] tracking-[0.18em]" style={{ color: active ? "rgba(255,220,150,0.8)" : "rgba(170,140,95,0.45)" }}>
                {p.short}
              </div>
              <div className="mt-2 text-[10px] leading-[1.3]" style={{ color: "rgba(198,182,156,0.45)" }}>
                {p.desc}
              </div>
              <div className="mt-2 text-[9px]" style={{ color: "rgba(150,130,100,0.4)" }}>
                {p.shadows ? `${p.shadowSize}px shadows` : "No shadows"} · {p.bloom ? `Bloom ${p.bloom}` : "No bloom"} · DPR {p.pixelRatio}
              </div>
              {active && (
                <div className="absolute right-2 top-2">
                  <div className="h-2 w-2 rounded-full" style={{ background: "#ffd47a", boxShadow: "0 0 8px rgba(255,212,122,0.9)" }} />
                </div>
              )}
            </button>
          );
        })}
      </div>
      <div className="mt-3 text-[10px] italic" style={{ color: "rgba(190,170,140,0.4)" }}>
        Changes apply instantly. Ultra Low disables shadows/mist/bloom for max FPS. X-High forces native DPR up to 2× and 2k shadows. Lock-on works with TAB/T/V even without pointer lock.
      </div>
    </div>
  );
}

// ------------------------------------------------------------------- Title
export function TitleScreen({
  onStart,
  audioOn,
  onToggleAudio,
  quality,
  onSetQuality,
}: {
  onStart: () => void;
  audioOn: boolean;
  onToggleAudio: () => void;
  quality: QualityLevel;
  onSetQuality: (q: QualityLevel) => void;
}) {
  const [showControls, setShowControls] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 50% 42%, rgba(0,0,0,0.14) 0%, rgba(4,3,6,0.78) 62%, rgba(2,2,4,0.96) 100%)" }} />
      <Embers />
      <div className="grain pointer-events-none absolute inset-0 opacity-[0.06]" />

      <div className="relative flex h-full w-full flex-col items-center justify-center px-6">
        <div className="anim-fade-up flex flex-col items-center" style={{ animationDelay: "0.15s" }}>
          <Ornament />
          <h1
            className="gold-text font-title mt-4 text-[clamp(46px,10.5vw,158px)] leading-[0.92] tracking-[0.16em]"
            style={{ textShadow: "0 0 90px rgba(255,180,90,0.30)" }}
          >
            ASHVEIL
          </h1>
          <div className="mt-2 font-title text-[clamp(9px,1.32vw,17px)] tracking-[0.62em]" style={{ color: "rgba(222,196,150,0.72)" }}>
            THRONE OF THE SUNDERED FLAME
          </div>
          <div className="mt-4">
            <Ornament flip />
          </div>
        </div>

        <p
          className="anim-fade-up mt-8 max-w-[620px] text-center text-[clamp(13px,1.15vw,17px)] italic leading-relaxed"
          style={{ color: "rgba(206,188,158,0.62)", animationDelay: "0.5s" }}
        >
          “The Tree burns still, though its roots have rotted through the world.
          Rise, Ashbearer. Seek King Aldric in Kingsfall Keep — he alone knows where the stolen flame sleeps.”
        </p>

        <div className="anim-fade-up mt-10 w-[min(88vw,420px)]" style={{ animationDelay: "0.85s" }}>
          <MenuButton primary label="BEGIN THE PILGRIMAGE" onClick={onStart} />
          <MenuButton label={showControls ? "CLOSE CODEX" : "CODEX OF ARMS"} onClick={() => setShowControls((v) => { setShowSettings(false); return !v; })} />
          <MenuButton label={showSettings ? "CLOSE SETTINGS" : `SETTINGS · ${quality.toUpperCase()}`} onClick={() => setShowSettings((v) => { setShowControls(false); return !v; })} />
          <MenuButton label={audioOn ? "SILENCE THE CHORUS" : "RESTORE THE CHORUS"} onClick={onToggleAudio} />
        </div>

        {showControls && (
          <div
            className="anim-fade-up mt-7 grid w-[min(92vw,760px)] grid-cols-1 gap-x-10 gap-y-[6px] p-6 sm:grid-cols-2"
            style={{
              background: "linear-gradient(180deg, rgba(12,10,9,0.86), rgba(6,5,5,0.9))",
              border: "1px solid rgba(196,164,102,0.22)",
              boxShadow: "0 20px 60px rgba(0,0,0,0.7), inset 0 0 40px rgba(0,0,0,0.6)",
            }}
          >
            {CONTROLS.map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-4 border-b border-dashed py-[3px]" style={{ borderColor: "rgba(180,150,100,0.13)" }}>
                <span className="font-title text-[11px] tracking-[0.2em]" style={{ color: "rgba(236,212,164,0.92)" }}>
                  {k}
                </span>
                <span className="text-[14px]" style={{ color: "rgba(198,182,156,0.62)" }}>
                  {v}
                </span>
              </div>
            ))}
          </div>
        )}

        {showSettings && (
          <div className="anim-fade-up mt-7 w-[min(92vw,860px)]" style={{ animationDelay: "0.1s" }}>
            <QualitySelector current={quality} onSet={onSetQuality} />
          </div>
        )}

        <div className="absolute bottom-5 left-0 right-0 text-center font-title text-[9px] tracking-[0.36em]" style={{ color: "rgba(180,158,120,0.3)" }}>
          A REAL-TIME PROCEDURAL WORLD · WEBGL · NO ASSETS, ONLY MATH
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------- Death
export function DeathScreen() {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 50% 50%, rgba(40,3,2,0.55) 0%, rgba(0,0,0,0.93) 70%)", animation: "hitFlash 0.6s ease-out reverse forwards" }} />
      <div className="relative text-center">
        <div
          className="anim-death font-title text-[clamp(42px,9vw,132px)] tracking-[0.34em]"
          style={{
            background: "linear-gradient(180deg,#ffd9c0 0%,#c8342a 42%,#5c0d08 100%)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
            textShadow: "0 0 70px rgba(180,25,15,0.5)",
          }}
        >
          YOU DIED
        </div>
        <div className="anim-fade-up mt-6 text-[13px] italic tracking-[0.3em]" style={{ color: "rgba(190,150,140,0.5)", animationDelay: "1.6s" }}>
          the grace calls you back…
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------- Victory
export function VictoryScreen({ runes, name, onContinue }: { runes: number; name: string; onContinue: () => void }) {
  const isFinal = name.toUpperCase().includes("HOLLOW") || name.toUpperCase().includes("ALDRIC");
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 50% 46%, rgba(90,52,10,0.42) 0%, rgba(4,3,3,0.92) 68%)" }} />
      <Embers n={70} />
      <div className="relative text-center">
        <div className="anim-fade-up">
          <Ornament />
        </div>
        <div
          className="anim-fade-up font-title mt-5 text-[clamp(26px,5.2vw,74px)] tracking-[0.28em] gold-text glow-gold"
          style={{ animationDelay: "0.3s" }}
        >
          {isFinal ? "THE CROWN IS BROKEN" : "GREAT ENEMY FELLED"}
        </div>
        <div className="anim-fade-up mt-4 font-title text-[clamp(11px,1.5vw,18px)] tracking-[0.5em]" style={{ color: "rgba(226,196,150,0.7)", animationDelay: "0.9s" }}>
          {name.toUpperCase()}
        </div>
        <div className="anim-fade-up mt-8 text-[clamp(13px,1.1vw,17px)] italic" style={{ color: "rgba(206,188,158,0.6)", animationDelay: "1.4s" }}>
          {isFinal
            ? "The flame is whole, and silent. The Ashveil is yours to wander, Ashbearer — scatter it, or keep it."
            : "The flame is yours. The Ashveil parts, and the Tree turns its light upon you."}
        </div>
        <div className="anim-fade-up mt-6 font-title text-[22px] tracking-[0.2em] gold-text" style={{ animationDelay: "1.8s" }}>
          {runes.toLocaleString()} RUNES
        </div>
        <div className="anim-fade-up mx-auto mt-8 w-[300px]" style={{ animationDelay: "2.2s" }}>
          <MenuButton primary label={isFinal ? "WANDER THE ASHVEIL" : "WANDER ON"} onClick={onContinue} />
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------- Pause
export function PauseScreen({
  onResume,
  onQuit,
  audioOn,
  onToggleAudio,
  runes,
  quality,
  onSetQuality,
}: {
  onResume: () => void;
  onQuit: () => void;
  audioOn: boolean;
  onToggleAudio: () => void;
  runes: number;
  quality: QualityLevel;
  onSetQuality: (q: QualityLevel) => void;
}) {
  const [showSettings, setShowSettings] = useState(false);

  return (
    <div className="absolute inset-0 flex items-center justify-center backdrop-blur-[3px]" style={{ background: "rgba(3,3,5,0.7)" }}>
      <div className="w-[min(92vw,860px)] max-h-[90vh] overflow-y-auto p-9 text-center" style={{ border: "1px solid rgba(196,164,102,0.2)", background: "linear-gradient(180deg, rgba(12,10,9,0.9), rgba(5,5,6,0.94))", boxShadow: "0 30px 90px rgba(0,0,0,0.8)" }}>
        <div className="flex justify-center">
          <Ornament />
        </div>
        <div className="gold-text font-title mt-3 text-[38px] tracking-[0.4em]">PAUSED</div>
        <div className="mt-1 font-title text-[10px] tracking-[0.34em]" style={{ color: "rgba(200,176,134,0.45)" }}>
          {runes.toLocaleString()} RUNES HELD · {quality.toUpperCase()} · TAB/T/V locks nearest even without mouse lock
        </div>

        {!showSettings && (
          <div className="mx-auto mt-7 grid max-w-[560px] grid-cols-1 gap-x-8 gap-y-[3px] sm:grid-cols-2">
            {CONTROLS.map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-3 border-b border-dashed py-[3px]" style={{ borderColor: "rgba(180,150,100,0.12)" }}>
                <span className="font-title text-[10px] tracking-[0.18em]" style={{ color: "rgba(236,212,164,0.85)" }}>
                  {k}
                </span>
                <span className="text-[13px]" style={{ color: "rgba(198,182,156,0.55)" }}>
                  {v}
                </span>
              </div>
            ))}
          </div>
        )}

        {showSettings && <QualitySelector current={quality} onSet={onSetQuality} />}

        <div className="mx-auto mt-7 w-[420px]">
          <MenuButton primary label="RETURN TO THE FIGHT" onClick={onResume} />
          <MenuButton label={showSettings ? "HIDE SETTINGS" : `QUALITY · ${quality.toUpperCase()}`} onClick={() => setShowSettings((v) => !v)} />
          <MenuButton label={audioOn ? "SILENCE THE CHORUS" : "RESTORE THE CHORUS"} onClick={onToggleAudio} />
          <MenuButton label="ABANDON — TITLE SCREEN" onClick={onQuit} />
        </div>
      </div>
    </div>
  );
}
