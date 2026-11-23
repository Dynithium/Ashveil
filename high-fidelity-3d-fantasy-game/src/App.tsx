import { useCallback, useEffect, useRef, useState } from "react";
import { Game, type HudState } from "./game/engine";
import { audio } from "./game/audio";
import { Hud } from "./ui/Hud";
import { DeathScreen, JournalScreen, PauseScreen, TitleScreen, VictoryScreen } from "./ui/Screens";
import { MapScreen } from "./ui/MapScreen";
import { AgentBenchmarkPanel } from "./ui/AgentBenchmarkPanel";
import { KinterOpeningCutscene } from "./ui/KinterOpeningCutscene";

const EMPTY: HudState = {
  hp: 140, maxHp: 140,
  stamina: 120, maxStamina: 120,
  fp: 80, maxFp: 80,
  flasks: 5, maxFlasks: 5,
  runes: 0,
  shards: 0,
  powers: [],
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
  paused: false,
  started: false,
  area: "Kingsfall Keep",
  popups: [],
  objective: "Speak with King Aldrich in the throne hall",
  hint: "Walk with W A S D · Press F to speak",
  marker: null,
  dialogue: null,
  upgrades: { blade: 0, vigor: 0, arcane: 0 },
  weapon: "greatsword",
  relicLoadout: { owned: [], slots: [null, null] },
  relicHeat: 0,
  overheating: false,
  overdrive: 0,
  overdriveCooldown: 0,
  ashBursts: 3,
  maxAshBursts: 5,
  filter: { condition: 100, stage: "stable", hazard: null },
  grappleKnown: false,
  grappleTarget: null,
  blessing: false,
  perf: null,
  quests: [],
  journalOpen: false,
  allQuests: [],
  journalUnlocked: [],
  mapOpen: false,
  map: {
    player: { x: 0, z: 112, yaw: 0 },
    villages: [],
    bosses: [],
    graces: [],
    questMarkers: [],
    marker: null,
    beacon: false,
  },
  prologue: null,
};

const SAVE_KEY = "ashveil-save-v1";
const AUTOSTART_KEY = "ashveil-autostart";
function hasSaveOnDisk() {
  try {
    return !!localStorage.getItem(SAVE_KEY);
  } catch {
    return false;
  }
}

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
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const [hud, setHud] = useState<HudState>(EMPTY);
  const [ready, setReady] = useState(false);
  const [audioOn, setAudioOn] = useState(true);
  const [agentPanelOpen, setAgentPanelOpen] = useState(false);
  const [hasSave, setHasSave] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const createGame = useCallback(() => {
    const el = mountRef.current;
    if (!el) return null;
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
    gameRef.current?.dispose();
    gameRef.current = null;
    setHud(EMPTY);
    const game = new Game(el);
    gameRef.current = game;
    unsubscribeRef.current = game.onState(setHud);
    game.run();
    // QA / cheat hooks exist only in development builds — production ships clean
    const qaEnabled = (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV === true;
    const params = new URLSearchParams(window.location.search);
    if (qaEnabled && params.has("debug")) {
      (window as unknown as { __ashveil?: Game }).__ashveil = game;
    }
    const qa = qaEnabled ? params.get("qa") : null;
    try {
      // A fresh campaign was requested from the title screen. The reloaded
      // engine is pristine, so hand control to the player immediately.
      if (localStorage.getItem(AUTOSTART_KEY) === "1") {
        localStorage.removeItem(AUTOSTART_KEY);
        window.setTimeout(() => {
          game.start();
          setHud((h) => ({ ...h, started: true, paused: false }));
        }, 250);
      }
    } catch {
      /* storage blocked — stay on the title screen */
    }
    if (qa) {
      const spots: Record<string, [number, number]> = {
        sootfall: [34, 108],
        violetpier: [-235, 200],
        galenest: [206, 100],
        rusthollow: [148, -182],
        vigilsend: [14, 78],
        stilthaven: [-92, -256],
        anvildeep: [196, -90],
        ashensanctuary: [-26, 86],
        citadel: [0, 8],
        gate: [0, 46],
        molten: [-112, -285],
      };
      const g = game as unknown as {
        finishPrologue: () => void;
        shardBosses: { shardId: string | null; pos: { x: number; z: number; set: (x: number, y: number, z: number) => void } }[];
        boss: { hp: number; maxHp: number; aggro: boolean };
        player: { pos: { set: (x: number, y: number, z: number) => void }; vel: { set: (x: number, y: number, z: number) => void }; yaw: number };
        qaGrantShards: (n: number) => void;
        qaGrantRelics: () => void;
        startKingTrial: () => void;
        qaRegionalCull: (id: string) => void;
        qaRegionalStory: (id: string) => void;
        qaEpilogue: () => void;
        qaGrapple: () => void;
        qaFilterHazard: () => void;
        qaGuardian: (id: string, signature?: boolean) => void;
      };
      if (qa === "kingtrial") {
        g.finishPrologue();
        g.startKingTrial();
      } else if (qa === "epilogue") {
        g.qaEpilogue();
      } else if (qa === "grapple") {
        g.qaGrapple();
      } else if (qa === "filter") {
        g.qaFilterHazard();
      } else if (qa.startsWith("cull:")) {
        g.qaRegionalCull(qa.slice("cull:".length));
      } else if (qa.startsWith("story:")) {
        g.qaRegionalStory(qa.slice("story:".length));
      } else if (spots[qa]) {
        g.finishPrologue();
        g.player.pos.set(spots[qa][0], 6, spots[qa][1]);
        g.player.vel.set(0, 0, 0);
      } else if (qa.startsWith("guardian:")) {
        g.qaGuardian(qa.slice("guardian:".length), params.has("signature"));
      }
      if (params.has("play")) {
        // headless visual-check: drop straight into the world
        window.setTimeout(() => {
          game.start();
          setHud((h) => ({ ...h, started: true }));
        }, 250);
      }
      const stage = params.get("stage");
      if (stage) {
        const w = game as unknown as { questStage: number; syncBeacon?: () => void };
        w.questStage = Math.max(0, Math.min(9, parseInt(stage, 10) || 0));
        w.syncBeacon?.();
      }
      const bosshp = params.get("bosshp");
      if (bosshp && g.boss) {
        const frac = Math.max(0.01, Math.min(1, parseFloat(bosshp) || 1));
        g.boss.hp = Math.max(1, Math.round(g.boss.maxHp * frac));
        g.boss.aggro = true;
      }
      if (params.has("killboss")) {
        // QA: run the true death pipeline — damage → death state → handleKill
        window.setTimeout(() => {
          const w = g as unknown as {
            boss: { damage: (amount: number, fromPos: { x: number; y: number; z: number }, ctx: unknown, poiseDmg?: number) => void; pos: { x: number; y: number; z: number } };
            handleKill?: (b: unknown) => void;
          };
          const noop = () => {};
          const proxyCtx = {
            particles: { emit: noop },
            waves: { spawn: noop },
            shake: noop,
            hitStop: noop,
            slowmo: noop,
            popup: noop,
            spawnProjectile: noop,
            onKill: (npc: unknown) => w.handleKill?.(npc),
          };
          w.boss.damage(999999, w.boss.pos, proxyCtx, 1);
        }, 700);
      }
      if (params.has("victory")) {
        window.setTimeout(() => {
          const w = g as unknown as { victory: boolean; victoryShown: boolean; victoryAt: number; emit?: () => void };
          w.victory = true;
          w.victoryShown = true;
          w.victoryAt = -999;
          w.emit?.();
        }, 700);
      }
      const shards = params.get("shards");
      if (shards) g.qaGrantShards(Math.max(0, Math.min(8, parseInt(shards, 10) || 0)));
      if (params.has("relics")) g.qaGrantRelics();
    }
    setHasSave(hasSaveOnDisk());
    setReady(true);
    return game;
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => {
      createGame();
    }, 60);

    return () => {
      window.clearTimeout(id);
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
      gameRef.current?.dispose();
      gameRef.current = null;
    };
  }, [createGame]);

  const start = useCallback(() => {
    setSaveError(null);
    audio.resume();
    audio.setEnabled(audioOn);
    // A fresh campaign must not inherit a finished run's in-memory state —
    // rebuild the world from a clean reload instead of mutating a live Game.
    gameRef.current?.eraseSave();
    setHasSave(false);
    try {
      localStorage.setItem(AUTOSTART_KEY, "1");
    } catch {
      // A blocked store must not make starting the game impossible.
      const game = createGame();
      game?.start();
      setHud((h) => ({ ...h, started: true, paused: false }));
      return;
    }
    window.location.reload();
  }, [audioOn, createGame]);

  const continueGame = useCallback(() => {
    audio.resume();
    audio.setEnabled(audioOn);
    const game = gameRef.current;
    if (!game || !game.loadSave()) {
      setSaveError("This saved campaign could not be loaded. It has not been erased.");
      return;
    }
    setSaveError(null);
    game.start();
    setHud((h) => ({ ...h, started: true, paused: false }));
  }, [audioOn]);

  const abandonSave = useCallback(() => {
    audio.ui("click");
    gameRef.current?.eraseSave();
    setHasSave(false);
    setSaveError(null);
  }, []);

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
    setHasSave(hasSaveOnDisk());
    setHud((h) => ({ ...h, started: false, paused: false }));
  }, []);

  const continueAfterVictory = useCallback(() => {
    audio.ui("click");
    gameRef.current?.dismissVictory();
  }, []);

  const closeMap = useCallback(() => gameRef.current?.toggleMap(), []);
  const closeJournal = useCallback(() => gameRef.current?.toggleJournal(), []);
  const travel = useCallback((idx: number) => gameRef.current?.fastTravel(idx), []);
  const assignRelic = useCallback((slot: 0 | 1, id: string | null) => { gameRef.current?.setRelicSlot(slot, id); }, []);
  const getGame = useCallback(() => gameRef.current, []);
  const openAgent = useCallback(() => setAgentPanelOpen(true), []);
  const restartGame = useCallback(() => createGame(), [createGame]);
  const openAgentFromPause = useCallback(() => {
    // Keep the world paused — the panel sits above the pause screen and the
    // benchmark unpauses itself (without pointer lock) once it takes over.
    setAgentPanelOpen(true);
  }, []);

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      <div ref={mountRef} className="absolute inset-0" />

      {/* film grain over the render */}
      <div className="grain pointer-events-none absolute inset-0 z-10 opacity-[0.045] mix-blend-overlay" />

      {hud.started && !hud.victoryShown && !hud.prologue?.active && <Hud s={hud} />}

      {hud.started && <KinterOpeningCutscene p={hud.prologue} />}

      {hud.started && hud.dead && (
        <div className="absolute inset-0 z-20">
          <DeathScreen />
        </div>
      )}

      {hud.started && hud.victoryShown && (
        <div className="absolute inset-0 z-30">
          <VictoryScreen runes={hud.runes} shards={hud.shards} onContinue={continueAfterVictory} />
        </div>
      )}

      {hud.started && hud.mapOpen && !hud.dead && !hud.victoryShown && (
        <MapScreen s={hud} onClose={closeMap} onTravel={travel} />
      )}

      {hud.started && hud.journalOpen && !hud.dead && !hud.victoryShown && !hud.mapOpen && (
        <JournalScreen allQuests={hud.allQuests} journalUnlocked={hud.journalUnlocked} onClose={closeJournal} />
      )}

      {hud.started && hud.paused && !hud.victoryShown && (
        <div className="absolute inset-0 z-40">
          <PauseScreen onResume={resume} onQuit={quit} onOpenAgent={openAgentFromPause} audioOn={audioOn} onToggleAudio={toggleAudio} runes={hud.runes} relicLoadout={hud.relicLoadout} onAssignRelic={assignRelic} />
        </div>
      )}

      {!hud.started && (
        <div className="absolute inset-0 z-30">
          <TitleScreen
            onStart={start}
            onContinue={continueGame}
            onAbandon={abandonSave}
            hasSave={hasSave}
            saveError={saveError}
            onOpenAgent={openAgent}
            audioOn={audioOn}
            onToggleAudio={toggleAudio}
          />
        </div>
      )}

      <AgentBenchmarkPanel
        open={agentPanelOpen}
        onOpen={openAgent}
        onClose={() => setAgentPanelOpen(false)}
        getGame={getGame}
        restartGame={restartGame}
        hud={hud}
      />

      <LoadingVeil done={ready} />
    </div>
  );
}
