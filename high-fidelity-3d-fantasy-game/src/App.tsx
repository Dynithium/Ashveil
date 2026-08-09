import { useCallback, useEffect, useRef, useState } from "react";
import { Game, type HudState } from "./game/engine";
import { audio } from "./game/audio";
import { Hud } from "./ui/Hud";
import { DeathScreen, PauseScreen, TitleScreen, VictoryScreen } from "./ui/Screens";
import { MapScreen } from "./ui/MapScreen";

const EMPTY: HudState = {
  hp: 140, maxHp: 140,
  stamina: 120, maxStamina: 120,
  fp: 80, maxFp: 80,
  flasks: 5, maxFlasks: 5,
  runes: 0,
  target: null,
  boss: null,
  prompt: null,
  lockOn: null,
  enemiesLeft: 0,
  fps: 60,
  bloodstain: 0,
  banner: null,
  dead: false,
  victory: false,
  victoryShown: false,
  victoryName: "MALENKAR, THE SUNDERED FLAME",
  paused: false,
  started: false,
  area: "Kingsfall Keep",
  popups: [],
  objective: "Speak with King Aldric in the throne hall",
  hint: "Walk with W A S D · Press F to speak",
  marker: null,
  dialogue: null,
  upgrades: { blade: 0, vigor: 0, arcane: 0 },
  weapon: "greatsword",
  mapOpen: false,
  map: {
    player: { x: 0, z: 112, yaw: 0 },
    villages: [],
    bosses: [],
    graces: [],
    marker: null,
  },
};

function LoadingVeil({ done }: { done: boolean }) {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center transition-opacity duration-[1400ms]"
      style={{ background: "#050406", opacity: done ? 0 : 1 }}
    >
      <div className="text-center">
        <div className="font-title text-[13px] tracking-[0.6em] anim-pulse-slow" style={{ color: "rgba(226,196,140,0.7)" }}>
          FORGING THE ASHVEIL
        </div>
        <div className="mt-4 h-px w-[240px]" style={{ background: "linear-gradient(90deg,transparent,rgba(226,196,140,0.55),transparent)" }} />
      </div>
    </div>
  );
}

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Game | null>(null);
  const [hud, setHud] = useState<HudState>(EMPTY);
  const [ready, setReady] = useState(false);
  const [audioOn, setAudioOn] = useState(true);

  useEffect(() => {
    const el = mountRef.current;
    if (!el || gameRef.current) return;

    let game: Game | null = null;
    const id = window.setTimeout(() => {
      game = new Game(el);
      gameRef.current = game;
      const off = game.onState(setHud);
      game.run();
      setReady(true);
      (game as any).__off = off;
    }, 60);

    return () => {
      window.clearTimeout(id);
      const g = gameRef.current;
      if (g) {
        (g as any).__off?.();
        g.dispose();
        gameRef.current = null;
      }
    };
  }, []);

  const start = useCallback(() => {
    audio.resume();
    audio.setEnabled(audioOn);
    gameRef.current?.start();
    setHud((h) => ({ ...h, started: true, paused: false }));
  }, [audioOn]);

  const toggleAudio = useCallback(() => {
    setAudioOn((v) => {
      const nv = !v;
      audio.resume();
      audio.setEnabled(nv);
      return nv;
    });
  }, []);

  const resume = useCallback(() => {
    audio.ui("click");
    gameRef.current?.setPaused(false);
  }, []);

  const quit = useCallback(() => {
    audio.ui("click");
    gameRef.current?.quitToTitle();
    setHud((h) => ({ ...h, started: false, paused: false }));
  }, []);

  const continueAfterVictory = useCallback(() => {
    audio.ui("click");
    gameRef.current?.dismissVictory();
  }, []);

  const closeMap = useCallback(() => gameRef.current?.toggleMap(), []);
  const travel = useCallback((idx: number) => gameRef.current?.fastTravel(idx), []);

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      <div ref={mountRef} className="absolute inset-0" />

      {/* film grain over the render */}
      <div className="grain pointer-events-none absolute inset-0 z-10 opacity-[0.045] mix-blend-overlay" />

      {hud.started && !hud.victoryShown && <Hud s={hud} />}

      {hud.started && hud.dead && (
        <div className="absolute inset-0 z-20">
          <DeathScreen />
        </div>
      )}

      {hud.started && hud.victoryShown && (
        <div className="absolute inset-0 z-30">
          <VictoryScreen runes={hud.runes} name={hud.victoryName} onContinue={continueAfterVictory} />
        </div>
      )}

      {hud.started && hud.mapOpen && !hud.dead && !hud.victoryShown && (
        <MapScreen s={hud} onClose={closeMap} onTravel={travel} />
      )}

      {hud.started && hud.paused && !hud.victoryShown && (
        <div className="absolute inset-0 z-40">
          <PauseScreen onResume={resume} onQuit={quit} audioOn={audioOn} onToggleAudio={toggleAudio} runes={hud.runes} />
        </div>
      )}

      {!hud.started && (
        <div className="absolute inset-0 z-30">
          <TitleScreen onStart={start} audioOn={audioOn} onToggleAudio={toggleAudio} />
        </div>
      )}

      <LoadingVeil done={ready} />
    </div>
  );
}
