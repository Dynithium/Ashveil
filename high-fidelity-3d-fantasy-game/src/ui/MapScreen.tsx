import { useState } from "react";
import type { HudState } from "../game/engine";
import { WORLD } from "../game/terrain";

// World now spans [-WALL, WALL] — sync to actual constant (was stale 205)
const WORLD_R = WORLD.wall;
const toPct = (v: number) => ((v + WORLD_R) / (WORLD_R * 2)) * 100;

export function MapScreen({
  s,
  onClose,
  onTravel,
}: {
  s: HudState;
  onClose: () => void;
  onTravel: (idx: number) => void;
}) {
  const [hover, setHover] = useState<string | null>(null);

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center" style={{ background: "rgba(3,3,5,0.82)", backdropFilter: "blur(4px)" }}>
      <div
        className="relative flex flex-col"
        style={{
          width: "min(92vw, 860px)",
          padding: 22,
          border: "1px solid rgba(196,164,102,0.28)",
          background: "linear-gradient(180deg, rgba(14,11,9,0.95), rgba(6,5,6,0.97))",
          boxShadow: "0 30px 90px rgba(0,0,0,0.85), inset 0 0 60px rgba(0,0,0,0.6)",
        }}
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="font-title text-[15px] tracking-[0.4em] gold-text">MAP OF THE ASHVEIL</div>
          <button
            onClick={onClose}
            className="font-title text-[11px] tracking-[0.25em] transition-colors"
            style={{ color: "rgba(214,188,140,0.7)" }}
          >
            CLOSE ✕
          </button>
        </div>

        {/* --- the map plate --- */}
        <div
          className="relative w-full"
          style={{
            aspectRatio: "1 / 1",
            maxHeight: "62vh",
            margin: "0 auto",
            background:
              "radial-gradient(ellipse at 50% 42%, rgba(58,48,36,0.6), rgba(20,16,13,0.9) 70%), repeating-linear-gradient(45deg, rgba(0,0,0,0) 0 10px, rgba(255,220,150,0.015) 10px 20px)",
            border: "1px solid rgba(150,120,74,0.35)",
            boxShadow: "inset 0 0 80px rgba(0,0,0,0.7)",
          }}
        >
          {/* biome washes */}
          <Wash x={-128} z={40} color="rgba(150,50,20,0.16)" label="THE CINDERWOOD" />
          <Wash x={118} z={-30} color="rgba(120,170,210,0.16)" label="FROSTMOURN REACH" />
          <Wash x={-60} z={-118} color="rgba(80,130,60,0.16)" label="THE MIREFEN" />
          <Wash x={0} z={120} color="rgba(200,170,110,0.12)" label="KINGSFALL KEEP" small />
          <Wash x={0} z={-18} color="rgba(180,60,30,0.18)" label="SUNKEN CATHEDRAL" small />

          {/* graces */}
          {s.map.graces.map((g) => (
            <button
              key={g.idx}
              disabled={!g.discovered}
              onClick={() => g.discovered && onTravel(g.idx)}
              onMouseEnter={() => setHover(g.discovered ? g.name : null)}
              onMouseLeave={() => setHover(null)}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${toPct(g.x)}%`, top: `${toPct(g.z)}%`, cursor: g.discovered ? "pointer" : "default" }}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" style={{ filter: g.discovered ? "drop-shadow(0 0 7px rgba(255,214,140,0.95))" : "none", opacity: g.discovered ? 1 : 0.28 }}>
                <path d="M10 1 L12 8 L19 10 L12 12 L10 19 L8 12 L1 10 L8 8 Z" fill={g.active ? "#fff0c8" : g.discovered ? "#ffd47a" : "#6b5c3c"} />
                {g.active && <circle cx="10" cy="10" r="9" fill="none" stroke="rgba(255,240,190,0.6)" strokeWidth="0.8" />}
              </svg>
            </button>
          ))}

          {/* villages */}
          {s.map.villages.map((v) => (
            <div
              key={v.name}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${toPct(v.x)}%`, top: `${toPct(v.z)}%` }}
              onMouseEnter={() => setHover(`${v.name} · rank ${v.level}${v.available ? " · upgrade ready" : ""}`)}
              onMouseLeave={() => setHover(null)}
            >
              <svg width="15" height="15" viewBox="0 0 15 15" style={{ filter: v.available ? "drop-shadow(0 0 6px rgba(255,200,120,0.9))" : "none" }}>
                <rect x="3.5" y="3.5" width="8" height="8" transform="rotate(45 7.5 7.5)" fill={v.available ? "#ffd47a" : "rgba(170,140,95,0.8)"} stroke="rgba(20,16,10,0.8)" strokeWidth="1" />
              </svg>
            </div>
          ))}

          {/* bosses */}
          {s.map.bosses.map((b) => (
            <div
              key={b.name}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${toPct(b.x)}%`, top: `${toPct(b.z)}%`, opacity: b.dead ? 0.3 : 1 }}
              onMouseEnter={() => setHover(b.dead ? `${b.name} — slain` : b.name)}
              onMouseLeave={() => setHover(null)}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" style={{ filter: b.dead ? "none" : "drop-shadow(0 0 6px rgba(255,90,40,0.8))" }}>
                <path d="M9 1 L17 9 L9 17 L1 9 Z" fill={b.main ? "#ff5a2a" : "#b98cff"} stroke="rgba(255,230,190,0.7)" strokeWidth="0.8" />
                {!b.dead && <circle cx="9" cy="9" r="2.4" fill="rgba(10,6,6,0.85)" />}
              </svg>
            </div>
          ))}

          {/* objective marker */}
          {s.map.marker && (
            <div className="absolute -translate-x-1/2 -translate-y-1/2 anim-pulse-slow" style={{ left: `${toPct(s.map.marker.x)}%`, top: `${toPct(s.map.marker.z)}%` }}>
              <svg width="22" height="22" viewBox="0 0 22 22">
                <circle cx="11" cy="11" r="9" fill="none" stroke="rgba(255,228,166,0.85)" strokeWidth="1.4" strokeDasharray="3 3" />
              </svg>
            </div>
          )}

          {/* player */}
          <div
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${toPct(s.map.player.x)}%`, top: `${toPct(s.map.player.z)}%` }}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" style={{ transform: `rotate(${(s.map.player.yaw * 180) / Math.PI}deg)`, filter: "drop-shadow(0 0 6px rgba(174,225,255,0.9))" }}>
              <path d="M10 2 L15 17 L10 13 L5 17 Z" fill="#aee1ff" stroke="#fff" strokeWidth="0.9" />
            </svg>
          </div>
        </div>

        {/* --- legend / hover --- */}
        <div className="mt-3 flex items-center justify-between">
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px]" style={{ color: "rgba(198,182,156,0.62)" }}>
            <Legend color="#ffd47a" shape="star" label="Grace (click to travel)" />
            <Legend color="#ffd47a" shape="diamond" label="Village forge" />
            <Legend color="#ff5a2a" shape="kite" label="Boss" />
            <Legend color="#aee1ff" shape="arrow" label="You" />
          </div>
          <div className="font-title text-[11px] tracking-[0.2em]" style={{ color: "rgba(255,224,160,0.85)", minHeight: 16 }}>
            {hover ?? "Select a discovered Grace to travel"}
          </div>
        </div>
        <div className="mt-2 text-center font-title text-[9px] tracking-[0.3em]" style={{ color: "rgba(180,158,120,0.4)" }}>
          M or ESC to close
        </div>
      </div>
    </div>
  );
}

function Wash({ x, z, color, label, small }: { x: number; z: number; color: string; label: string; small?: boolean }) {
  const size = small ? 16 : 30;
  return (
    <>
      <div
        className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ left: `${toPct(x)}%`, top: `${toPct(z)}%`, width: `${size}%`, height: `${size}%`, background: `radial-gradient(circle, ${color}, transparent 70%)` }}
      />
      <div
        className="absolute -translate-x-1/2 font-title"
        style={{ left: `${toPct(x)}%`, top: `${toPct(z) - (small ? 4 : 7)}%`, fontSize: small ? 7 : 8, letterSpacing: "0.18em", color: "rgba(224,204,164,0.5)", whiteSpace: "nowrap", pointerEvents: "none" }}
      >
        {label}
      </div>
    </>
  );
}

function Legend({ color, shape, label }: { color: string; shape: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <svg width="11" height="11" viewBox="0 0 11 11">
        {shape === "star" && <path d="M5.5 0 L7 4 L11 5.5 L7 7 L5.5 11 L4 7 L0 5.5 L4 4 Z" fill={color} />}
        {shape === "diamond" && <rect x="2" y="2" width="7" height="7" transform="rotate(45 5.5 5.5)" fill={color} />}
        {shape === "kite" && <path d="M5.5 0 L11 5.5 L5.5 11 L0 5.5 Z" fill={color} />}
        {shape === "arrow" && <path d="M5.5 1 L9 10 L5.5 7.5 L2 10 Z" fill={color} />}
      </svg>
      {label}
    </span>
  );
}
