import { useEffect, useRef, useState } from "react";
import { WORLD } from "../game/terrain";
import type { HudState } from "../game/engine";

const WEAPON_LABEL: Record<string, string> = {
  greatsword: "GREATSWORD",
  twinblades: "TWIN BLADES",
  halberd: "HALBERD",
};

// ----------------------------------------------------------------- Stat bar
function Bar({
  value,
  max,
  width,
  height,
  color,
  glow,
  delay = true,
}: {
  value: number;
  max: number;
  width: number | string;
  height: number;
  color: string;
  glow: string;
  delay?: boolean;
}) {
  const pct = Math.max(0, Math.min(1, value / max)) * 100;
  const [ghost, setGhost] = useState(pct);
  const t = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!delay) { setGhost(pct); return; }
    if (pct > ghost) { setGhost(pct); return; }
    window.clearTimeout(t.current);
    t.current = window.setTimeout(() => setGhost(pct), 380);
  }, [pct, ghost, delay]);

  return (
    <div
      className="relative overflow-hidden"
      style={{
        width,
        height,
        background: "rgba(8,7,6,0.85)",
        border: "1px solid rgba(196,164,102,0.14)",
        boxShadow: `0 1px 0 rgba(255,240,200,0.04) inset, 0 0 0 1px rgba(0,0,0,0.6)`,
        borderRadius: 2,
      }}
    >
      <div
        className="absolute inset-y-0 left-0"
        style={{ width: `${ghost}%`, background: "rgba(120,40,30,0.35)", transition: "width 560ms cubic-bezier(0.16,1,0.3,1)" }}
      />
      <div
        className="absolute inset-y-0 left-0"
        style={{
          width: `${pct}%`,
          background: color,
          boxShadow: `0 0 10px ${glow}`,
          transition: "width 120ms linear",
        }}
      />
      {/* crisp highlight */}
      <div className="absolute top-0 left-0 right-0 h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.22), transparent)" }} />
    </div>
  );
}

// ------------------------------------------------------------------- Flask
function Flask({ filled }: { filled: boolean }) {
  return (
    <svg width="21" height="30" viewBox="0 0 21 30" style={{ filter: filled ? "drop-shadow(0 0 6px rgba(255,190,90,0.65))" : "none" }}>
      <path d="M7 2 h7 v5 l4 8 v11 a3 3 0 0 1 -3 3 h-9 a3 3 0 0 1 -3 -3 v-11 l4 -8 z"
        fill={filled ? "url(#fg)" : "rgba(20,18,15,0.85)"} stroke="rgba(212,178,110,0.85)" strokeWidth="1.1" />
      <rect x="6.4" y="0.6" width="8.2" height="3" rx="1" fill="#463a24" stroke="rgba(212,178,110,0.8)" strokeWidth="0.8" />
      <defs>
        <linearGradient id="fg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffe6ad" />
          <stop offset="45%" stopColor="#ffb257" />
          <stop offset="100%" stopColor="#a2521a" />
        </linearGradient>
      </defs>
    </svg>
  );
}

const POPUP_STYLE: Record<string, { color: string; size: number; weight: number; shadow: string }> = {
  dmg: { color: "#f4ead2", size: 21, weight: 600, shadow: "0 2px 6px #000" },
  crit: { color: "#ffd47a", size: 33, weight: 800, shadow: "0 0 18px rgba(255,180,60,0.9), 0 2px 6px #000" },
  magic: { color: "#a5dcff", size: 24, weight: 700, shadow: "0 0 16px rgba(110,190,255,0.8), 0 2px 6px #000" },
  playerhurt: { color: "#ff7264", size: 24, weight: 700, shadow: "0 0 14px rgba(200,40,30,0.8), 0 2px 6px #000" },
  heal: { color: "#bff5a8", size: 22, weight: 700, shadow: "0 0 14px rgba(120,240,120,0.6)" },
  runes: { color: "#ffeab4", size: 20, weight: 600, shadow: "0 0 14px rgba(255,220,140,0.7)" },
  parry: { color: "#fff6d8", size: 30, weight: 800, shadow: "0 0 22px rgba(255,240,190,0.95)" },
  warn: { color: "#ffb44a", size: 22, weight: 800, shadow: "0 0 16px rgba(255,150,40,0.8)" },
};

function MiniMap({ s }: { s: HudState }) {
  const R = WORLD.wall; // auto-sync with actual world radius (was stale 205)
  const cx = 74;
  const cy = 74;
  const sc = 60 / R;
  const px = cx + s.map.player.x * sc;
  const py = cy + s.map.player.z * sc;
  const playerDir = `rotate(${(s.map.player.yaw * 180) / Math.PI} ${px} ${py})`;
  return (
    <div className="absolute right-7 top-[54px]">
      <svg width="148" height="148" viewBox="0 0 148 148" style={{ filter: "drop-shadow(0 12px 28px rgba(0,0,0,0.65))" }}>
        <defs>
          <radialGradient id="mapbg" cx="50%" cy="46%" r="58%">
            <stop offset="0%" stopColor="rgba(36,31,25,0.88)" />
            <stop offset="100%" stopColor="rgba(6,5,5,0.92)" />
          </radialGradient>
          <clipPath id="mapclip"><circle cx="74" cy="74" r="66" /></clipPath>
        </defs>
        <circle cx="74" cy="74" r="69" fill="rgba(0,0,0,0.55)" stroke="rgba(218,188,130,0.32)" strokeWidth="1.2" />
        <g clipPath="url(#mapclip)">
          <circle cx="74" cy="74" r="66" fill="url(#mapbg)" />
          <circle cx={cx} cy={cy} r={WORLD_RING(52, sc)} fill="rgba(90,26,16,0.28)" stroke="rgba(255,130,70,0.25)" />
          <rect x={cx - 26 * sc} y={cy + (120 - 26) * sc} width={52 * sc} height={52 * sc} fill="rgba(218,188,130,0.18)" stroke="rgba(218,188,130,0.35)" />
          <path d={`M${cx},${cy + 120 * sc} L${cx},${cy - 18 * sc}`} stroke="rgba(214,184,126,0.22)" strokeWidth="2" strokeDasharray="4 5" />

          {s.map.marker && (
            <path
              d={`M${cx + s.map.marker.x * sc},${cy + s.map.marker.z * sc - 6} L${cx + s.map.marker.x * sc + 6},${cy + s.map.marker.z * sc} L${cx + s.map.marker.x * sc},${cy + s.map.marker.z * sc + 6} L${cx + s.map.marker.x * sc - 6},${cy + s.map.marker.z * sc} Z`}
              fill="rgba(255,226,150,0.95)"
              stroke="rgba(255,255,230,0.8)"
            />
          )}

          {s.map.graces.filter((g) => g.discovered).map((g) => (
            <g key={g.idx} transform={`translate(${cx + g.x * sc} ${cy + g.z * sc})`}>
              <path d="M0 -3.6 L1 -1 L3.6 0 L1 1 L0 3.6 L-1 1 L-3.6 0 L-1 -1 Z" fill={g.active ? "#fff0c8" : "#ffd47a"} />
            </g>
          ))}

          {s.map.villages.map((v) => (
            <g key={v.name} transform={`translate(${cx + v.x * sc} ${cy + v.z * sc})`}>
              <rect x="-4" y="-4" width="8" height="8" fill={v.available ? "#ffd47a" : "rgba(170,140,95,0.78)"} transform="rotate(45)" />
              <circle cx="0" cy="0" r="1.5" fill="rgba(10,8,6,0.9)" />
            </g>
          ))}

          {s.map.bosses.map((b) => (
            <g key={b.name} transform={`translate(${cx + b.x * sc} ${cy + b.z * sc})`} opacity={b.dead ? 0.28 : 1}>
              <path d="M0 -6 L6 0 L0 6 L-6 0 Z" fill={b.main ? "#ff6a2a" : "#b98cff"} stroke="rgba(255,230,190,0.7)" strokeWidth="0.7" />
            </g>
          ))}

          <g transform={playerDir}>
            <path d={`M${px},${py - 8} L${px + 5},${py + 6} L${px},${py + 3} L${px - 5},${py + 6} Z`} fill="#aee1ff" stroke="#ffffff" strokeWidth="0.8" />
          </g>
        </g>
        <circle cx="74" cy="74" r="66" fill="none" stroke="rgba(226,196,140,0.22)" strokeWidth="1" />
        <text x="74" y="140" textAnchor="middle" className="font-title" fontSize="7" letterSpacing="2" fill="rgba(226,196,140,0.52)">ASHVEIL</text>
      </svg>
    </div>
  );
}

function WORLD_RING(r: number, sc: number) {
  return r * sc;
}

// -------------------------------------------------------------------- HUD
export function Hud({ s }: { s: HudState }) {
  const lowHp = s.hp / s.maxHp < 0.3;

  return (
    <div className="pointer-events-none absolute inset-0 select-none" style={{ fontFamily: '"Cormorant Garamond", serif' }}>
      {/* ---------- crit flash — insane polish */}
      {s.popups.some(p=>p.kind==='crit' && Date.now()-p.born < 120) && (
        <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at 50% 50%, rgba(255,220,150,0.18), transparent 70%)", animation: "hitFlash 0.22s ease-out forwards" }} />
      )}

      {/* ---------- damage numbers ---------- */}
      {s.popups.map((p) => {
        const st = POPUP_STYLE[p.kind] ?? POPUP_STYLE.dmg;
        const isCrit = p.kind==='crit';
        return (
          <div
            key={p.id}
            className="absolute font-title"
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              transform: `translate(-50%,-50%) scale(${isCrit?1.18:1})`,
              color: st.color,
              fontSize: st.size,
              fontWeight: st.weight,
              textShadow: st.shadow,
              animation: `${isCrit ? "riseFade 1.6s cubic-bezier(0.16,1,0.3,1) forwards, pulseSlow 0.3s ease-out" : "riseFade 1.4s cubic-bezier(0.16,1,0.3,1) forwards"}`,
              letterSpacing: "0.06em",
            }}
          >
            {p.text}
          </div>
        );
      })}

      {/* ---------- lock-on reticle — insane polish: pulsing diamond + ticks */}
      {s.lockOn && (
        <div className="absolute" style={{ left: `${s.lockOn.x}%`, top: `${s.lockOn.y}%`, transform: "translate(-50%,-50%)" }}>
          <svg width="56" height="56" viewBox="0 0 56 56" style={{ filter: "drop-shadow(0 0 12px rgba(255,235,190,1))" }}>
            <g stroke="rgba(255,242,214,0.95)" strokeWidth="1.4" fill="none" className="anim-pulse-slow">
              <path d="M28 4 L36 28 L28 52 L20 28 Z" opacity="0.9" />
              <circle cx="28" cy="28" r="3.6" fill="rgba(255,240,200,0.95)" stroke="none" />
              <circle cx="28" cy="28" r="18" fill="none" stroke="rgba(255,220,150,0.35)" strokeWidth="0.8" strokeDasharray="3 4" />
            </g>
            <g stroke="rgba(255,220,150,0.5)" strokeWidth="1" fill="none">
              <path d="M28 0 L28 6 M28 50 L28 56 M0 28 L6 28 M50 28 L56 28" />
            </g>
          </svg>
          <div className="absolute left-1/2 top-full mt-2 -translate-x-1/2 font-title text-[9px] tracking-[0.3em]" style={{ color: "rgba(255,232,180,0.7)", textShadow: "0 2px 6px #000" }}>
            LOCKED · TAB/T/V UNLOCK
          </div>
        </div>
      )}

      {/* ---------- vignette + low hp pulse ---------- */}
      <div className="absolute inset-0 vignette" />
      {lowHp && !s.dead && (
        <div className="absolute inset-0 anim-pulse-slow" style={{ background: "radial-gradient(ellipse at 50% 55%, transparent 40%, rgba(120,10,6,0.42) 100%)" }} />
      )}

      {/* ---------- top-left stats ---------- */}
      <div className="absolute left-6 top-5 flex flex-col gap-[7px]">
        <div className="flex items-center gap-2">
          <Bar value={s.hp} max={s.maxHp} width={330} height={17} color="linear-gradient(180deg,#e0664a,#a8231a 60%,#7d150f)" glow="rgba(220,70,40,0.55)" />
          <span className="font-title text-[11px] tracking-[0.2em]" style={{ color: "rgba(226,196,140,0.65)" }}>
            {Math.ceil(s.hp)}
          </span>
        </div>
        <div className="ml-[10px] flex items-center gap-2">
          <Bar value={s.fp} max={s.maxFp} width={224} height={11} color="linear-gradient(180deg,#7fc9ee,#2b6f9c 60%,#1b4a6b)" glow="rgba(90,180,240,0.5)" delay={false} />
        </div>
        <div className="ml-[10px] flex items-center gap-2">
          <div className={s.stamina / s.maxStamina < 0.22 ? "anim-pulse-slow" : ""}>
            <Bar value={s.stamina} max={s.maxStamina} width={268} height={11} color={s.stamina / s.maxStamina < 0.22 ? "linear-gradient(180deg,#ff8a6a,#c03a20 60%,#7a150f)" : "linear-gradient(180deg,#a9d97e,#4d8a3a 60%,#2f5e26)"} glow={s.stamina / s.maxStamina < 0.22 ? "rgba(255,90,40,0.7)" : "rgba(140,220,110,0.45)"} delay={false} />
          </div>
          {s.stamina / s.maxStamina < 0.22 && <span className="font-title text-[9px] tracking-[0.2em] anim-pulse-slow" style={{ color: "rgba(255,120,90,0.85)" }}>EXHAUSTED</span>}
        </div>
      </div>

      {/* ---------- objective tracker — clean, honorable */}
      <div className="absolute left-6 top-[104px] max-w-[340px]">
        <div className="flex items-center gap-2.5">
          <div className="h-px w-5" style={{ background: "rgba(226,196,140,0.35)" }} />
          <span className="font-title text-[10px] tracking-[0.32em]" style={{ color: "rgba(230,204,156,0.75)", textShadow: "0 1px 0 #000" }}>
            {s.objective.toUpperCase()}
          </span>
        </div>
        {s.hint && (
          <div className="ml-[28px] mt-[4px] text-[11.5px] italic leading-[1.4]" style={{ color: "rgba(190,174,146,0.52)", textShadow: "0 1px 0 #000" }}>
            {s.hint}
          </div>
        )}
      </div>

      {/* ---------- quest marker ---------- */}
      {s.marker && !s.boss && (
        <div className="absolute text-center" style={{ left: `${s.marker.x}%`, top: `${s.marker.y}%`, transform: "translate(-50%,-50%)" }}>
          <svg width="26" height="26" viewBox="0 0 26 26" className="anim-pulse-slow" style={{ filter: "drop-shadow(0 0 10px rgba(255,214,140,0.9))" }}>
            <path d="M13 1 L25 13 L13 25 L1 13 Z" fill="none" stroke="rgba(255,228,166,0.95)" strokeWidth="1.6" />
            <path d="M13 7 L19 13 L13 19 L7 13 Z" fill="rgba(255,220,150,0.85)" />
          </svg>
          <div className="font-title mt-[2px] text-[10px] tracking-[0.14em]" style={{ color: "rgba(255,232,180,0.85)", textShadow: "0 2px 6px #000" }}>
            {s.marker.dist}m
          </div>
        </div>
      )}

      {/* ---------- dialogue ---------- */}
      {s.dialogue && (
        <>
          <div className="absolute inset-x-0 bottom-0 h-[42%]" style={{ background: "linear-gradient(180deg, transparent, rgba(2,2,4,0.88))" }} />
          <div className="anim-fade-up absolute bottom-[7%] left-1/2 w-[min(88vw,860px)] -translate-x-1/2 text-center" key={s.dialogue.idx}>
            <div className="font-title mb-3 text-[13px] tracking-[0.5em] gold-text glow-gold">{s.dialogue.speaker}</div>
            <div
              className="px-8 text-[clamp(17px,1.6vw,23px)] italic leading-relaxed"
              style={{ color: "rgba(238,226,200,0.94)", textShadow: "0 2px 10px #000" }}
            >
              “{s.dialogue.lines[s.dialogue.idx]}”
            </div>
            <div className="mx-auto mt-4 h-px w-[280px]" style={{ background: "linear-gradient(90deg,transparent,rgba(226,196,140,0.5),transparent)" }} />
            <div className="anim-pulse-slow mt-3 font-title text-[10px] tracking-[0.32em]" style={{ color: "rgba(214,188,140,0.6)" }}>
              F / CLICK — CONTINUE · {s.dialogue.idx + 1}/{s.dialogue.lines.length}
            </div>
          </div>
        </>
      )}

      {/* ---------- flasks ---------- */}
      <div className="absolute bottom-7 left-7 flex items-end gap-4">
        <div className="flex items-end gap-[5px]">
          {Array.from({ length: s.maxFlasks }).map((_, i) => (
            <Flask key={i} filled={i < s.flasks} />
          ))}
        </div>
        <div className="mb-1 font-title text-[10px] tracking-[0.28em]" style={{ color: "rgba(214,182,124,0.5)" }}>
          R · FLASK
        </div>
      </div>

      {/* ---------- runes — polished count-up */}
      <div className="absolute bottom-7 right-8 flex items-center gap-3">
        <svg width="20" height="20" viewBox="0 0 20 20" style={{ filter: "drop-shadow(0 0 8px rgba(255,214,140,0.8))" }}>
          <path d="M10 1 L13 7 L19 10 L13 13 L10 19 L7 13 L1 10 L7 7 Z" fill="rgba(255,226,168,0.92)" />
        </svg>
        <div className="font-title text-[22px] tracking-[0.12em] gold-text" style={{ transition: "transform 0.2s ease" }}>
          {s.runes.toLocaleString()}
        </div>
        {s.runes > 0 && (
          <div className="font-title text-[10px] tracking-[0.2em] ml-1" style={{ color: "rgba(226,196,140,0.5)" }}>
            RUNES
          </div>
        )}
      </div>

      {/* ---------- damage direction — insane polish */}
      {s.damageDir && (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none" style={{ width: 220, height: 220 }}>
          <div
            className="absolute left-1/2 top-1/2"
            style={{
              transform: `translate(-50%,-50%) rotate(${s.damageDir.angle}rad) translateY(-96px)`,
              opacity: 0.85,
            }}
          >
            <svg width="26" height="26" viewBox="0 0 26 26" style={{ filter: "drop-shadow(0 0 8px rgba(255,60,40,0.9))" }}>
              <path d="M13 2 L18 14 L13 11 L8 14 Z" fill="rgba(255,80,60,0.92)" stroke="rgba(255,180,160,0.6)" strokeWidth="0.8" />
            </svg>
          </div>
          <div className="absolute inset-0 rounded-full" style={{ border: "1px solid rgba(255,80,60,0.18)", background: "radial-gradient(circle, transparent 68%, rgba(120,10,6,0.22) 100%)" }} />
        </div>
      )}

      {s.bloodstain > 0 && (
        <div className="absolute bottom-[74px] right-8 font-title text-[11px] tracking-[0.22em]" style={{ color: "rgba(150,200,240,0.75)" }}>
          {s.bloodstain.toLocaleString()} RUNES LOST
        </div>
      )}

      {/* ---------- area name ---------- */}
      <div className="absolute right-8 top-6 text-right">
        <div className="font-title text-[10px] tracking-[0.34em]" style={{ color: "rgba(214,182,124,0.42)" }}>
          {s.area.toUpperCase()}
        </div>
        <div className="mt-1 font-title text-[9px] tracking-[0.28em]" style={{ color: "rgba(180,160,130,0.28)" }}>
          {WEAPON_LABEL[s.weapon] ?? s.weapon} · {s.fps} FPS · {s.quality?.toUpperCase() || "MEDIUM"}
        </div>
        <div className="mt-[2px] font-title text-[9px] tracking-[0.26em]" style={{ color: "rgba(226,196,140,0.4)" }}>
          M — MAP & TRAVEL · ESC — PAUSE · QUALITY IN PAUSE · TAB/T/V LOCK EVEN WITHOUT MOUSE
        </div>
      </div>

      <MiniMap s={s} />

      <div className="absolute right-8 top-[204px] text-right font-title text-[9px] tracking-[0.18em]" style={{ color: "rgba(226,196,140,0.48)", textShadow: "0 2px 6px #000" }}>
        BLADE +{s.upgrades.blade} · VIGOR +{s.upgrades.vigor} · ARCANE +{s.upgrades.arcane}
      </div>

      {/* ---------- combo — insane polish: shows when >=2 */}
      {s.combo >= 2 && (
        <div className="absolute left-1/2 top-[28%] -translate-x-1/2 text-center pointer-events-none">
          <div
            className="font-title anim-fade-up"
            style={{
              fontSize: s.combo >=5 ? 54 : 38,
              letterSpacing: "0.18em",
              color: s.combo >=5 ? "#ffe9b0" : "#f4ead2",
              textShadow: s.combo >=5 ? "0 0 28px rgba(255,220,150,0.9), 0 2px 12px #000" : "0 2px 8px #000",
              transform: `scale(${1 + Math.min(0.25, s.combo*0.025)})`,
            }}
          >
            {s.combo}x COMBO
          </div>
          <div className="font-title text-[10px] tracking-[0.3em] mt-1" style={{ color: "rgba(226,196,140,0.6)" }}>
            {s.combo >=8 ? "UNSTOPPABLE" : s.combo >=5 ? "FLAME INCARNATE" : s.combo >=3 ? "KEEP GOING" : ""}
          </div>
        </div>
      )}

      {/* ---------- target hp ---------- */}
      {s.target && (
        <div className="absolute left-1/2 top-[72px] -translate-x-1/2 text-center">
          <div className="mb-1 font-title text-[11px] tracking-[0.3em]" style={{ color: "rgba(228,204,158,0.8)", textShadow: "0 2px 8px #000" }}>
            {s.target.name.toUpperCase()}
          </div>
          <Bar value={s.target.hp} max={s.target.maxHp} width={280} height={7} color="linear-gradient(180deg,#d4553c,#8c1c14)" glow="rgba(200,60,40,0.5)" />
        </div>
      )}

      {/* ---------- boss bar ---------- */}
      {s.boss && (
        <div className="anim-boss-bar absolute bottom-[46px] left-1/2 w-[min(62vw,880px)] -translate-x-1/2 text-center">
          <div
            className="mb-[7px] font-title text-[15px] tracking-[0.42em]"
            style={{ color: "#e9d5a6", textShadow: "0 0 22px rgba(255,150,60,0.55), 0 2px 8px #000" }}
          >
            {s.boss.name}
          </div>
          <div className="relative">
            <Bar value={s.boss.hp} max={s.boss.maxHp} width="100%" height={13} color="linear-gradient(180deg,#f0a04a,#b8341c 55%,#6d1108)" glow="rgba(255,120,40,0.6)" />
            <div className="pointer-events-none absolute inset-0 shimmer opacity-25" />
            {[0.36, 0.68].map((p) => (
              <div key={p} className="absolute top-0 h-full w-px" style={{ left: `${(1 - p) * 100}%`, background: "rgba(0,0,0,0.75)" }} />
            ))}
          </div>
          <div className="mt-1 font-title text-[9px] tracking-[0.3em]" style={{ color: "rgba(255,180,110,0.55)" }}>
            {["FIRST FORM", "KINDLED", "SUNDERED"][s.boss.phase]}
          </div>
        </div>
      )}

      {/* ---------- interaction prompt — clean honorable pill */}
      {s.prompt && (
        <div className="absolute bottom-[27%] left-1/2 -translate-x-1/2 text-center">
          <div
            className="px-7 py-[9px] font-title text-[11px] tracking-[0.34em] rounded-sm"
            style={{
              color: "#f0e2c0",
              background: "rgba(18,16,14,0.82)",
              border: "1px solid rgba(196,164,102,0.18)",
              backdropFilter: "blur(12px)",
              boxShadow: "0 8px 24px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,240,200,0.06)",
              textShadow: "0 1px 0 #000",
            }}
          >
            {s.prompt}
          </div>
        </div>
      )}

      {/* ---------- banner — clean, honorable, crisp */}
      {s.banner && (
        <div key={s.banner.id} className="anim-banner absolute left-1/2 top-[24%] -translate-x-1/2 text-center">
          <div className="font-title text-[clamp(20px,3.2vw,40px)] tracking-[0.42em] gold-text-clean" style={{ letterSpacing: "0.42em" }}>{s.banner.title}</div>
          {s.banner.sub && (
            <div className="mt-2 text-[clamp(11px,1.05vw,14px)] italic tracking-[0.28em] font-light" style={{ color: "rgba(220,196,152,0.58)" }}>
              {s.banner.sub}
            </div>
          )}
          <div className="mx-auto mt-3 h-px w-[min(36vw,380px)]" style={{ background: "linear-gradient(90deg,transparent,rgba(226,196,140,0.32),transparent)" }} />
        </div>
      )}
    </div>
  );
}
