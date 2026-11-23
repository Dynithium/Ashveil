import { useEffect, useMemo, useRef, useState } from "react";
import type { Game, HudState } from "../game/engine";
import { audio } from "../game/audio";
import {
  actionLabel,
  campaignProgress,
  requestAgentAction,
  requestKnowledgeScore,
  type AshveilBenchmarkConfig,
} from "../game/ashveilBenchmark";

const CONFIG_KEY = "ashveil_ai_benchmark_config_v1";

type LogEntry = { step: number; action: string; thought: string; ok: boolean; note: string };
type RunState = {
  running: boolean;
  busy: boolean;
  scope: "full" | "takeover";
  step: number;
  deaths: number;
  failures: number;
  apiErrors: number;
  startedAt: number | null;
  finishedReason: string | null;
  error: string | null;
  baseline: string[];
  log: LogEntry[];
  quizStatus: "not_started" | "running" | "complete" | "error";
  quizScore: number;
};

const EMPTY_RUN: RunState = {
  running: false,
  busy: false,
  scope: "full",
  step: 0,
  deaths: 0,
  failures: 0,
  apiErrors: 0,
  startedAt: null,
  finishedReason: null,
  error: null,
  baseline: [],
  log: [],
  quizStatus: "not_started",
  quizScore: 0,
};

function readConfig(): AshveilBenchmarkConfig {
  const defaults = { baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini", apiKey: "", maxActions: 2500 };
  try {
    const saved = JSON.parse(localStorage.getItem(CONFIG_KEY) || "{}");
    return {
      baseUrl: typeof saved.baseUrl === "string" ? saved.baseUrl : defaults.baseUrl,
      model: typeof saved.model === "string" ? saved.model : defaults.model,
      apiKey: typeof saved.apiKey === "string" ? saved.apiKey : "",
      maxActions: Number.isFinite(saved.maxActions) ? Math.max(1, Math.min(5000, saved.maxActions)) : defaults.maxActions,
    };
  } catch {
    return defaults;
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

export function AgentBenchmarkPanel({
  open,
  onOpen,
  onClose,
  getGame,
  restartGame,
  hud,
}: {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  getGame: () => Game | null;
  restartGame: () => Game | null;
  hud: HudState;
}) {
  const [config, setConfig] = useState<AshveilBenchmarkConfig>(readConfig);
  const [run, setRun] = useState<RunState>(EMPTY_RUN);
  const runRef = useRef<RunState>(EMPTY_RUN);
  const configRef = useRef(config);
  const tokenRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const runSingleRef = useRef(false);
  const [elapsed, setElapsed] = useState(0);

  const updateRun = (change: (current: RunState) => RunState) => {
    const next = change(runRef.current);
    runRef.current = next;
    setRun(next);
  };

  useEffect(() => {
    configRef.current = config;
    // Persist connection preferences, but keep the credential in memory only.
    // This also removes keys saved by older versions on the next render.
    try {
      const { apiKey: _apiKey, ...preferences } = config;
      localStorage.setItem(CONFIG_KEY, JSON.stringify(preferences));
    } catch { /* storage may be disabled */ }
  }, [config]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== "F4") return;
      event.preventDefault();
      audio.ui("click");
      if (open) onClose();
      else onOpen();
    };
    const onOpenEvent = () => onOpen();
    window.addEventListener("keydown", onKey);
    window.addEventListener("ashveil:open-ai-benchmark", onOpenEvent);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("ashveil:open-ai-benchmark", onOpenEvent);
    };
  }, [open, onOpen, onClose]);

  useEffect(() => {
    if (!run.running || run.startedAt === null) return;
    const update = () => setElapsed(Math.floor((Date.now() - run.startedAt!) / 1000));
    update();
    const timer = window.setInterval(update, 500);
    return () => window.clearInterval(timer);
  }, [run.running, run.startedAt]);

  const progressSnapshot = useMemo(() => (open ? getGame()?.getAgentSnapshot() : undefined), [open, hud.started]);
  const progress = progressSnapshot ? campaignProgress(progressSnapshot, run.scope === "takeover" ? run.baseline : []) : null;
  const elapsedText = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;
  const currentGameStarted = hud.started;
  const canResumeRun = !!run.startedAt && !run.running && !progressSnapshot?.victory &&
    !!run.finishedReason && run.step < config.maxActions;

  const saveFailure = (error: unknown, token: number) => {
    if (token !== tokenRef.current) return;
    // apiErrors are counted per attempt in the retry loop — don't count twice.
    updateRun((current) => ({ ...current, running: false, busy: false, error: String((error as Error)?.message ?? error), finishedReason: "Run stopped — request error" }));
    getGame()?.setAgentControl(false);
    abortRef.current = null;
  };

  const runKnowledgeQuiz = async (token: number) => {
    // An abort (user returned control) must not strand the quiz on "running".
    const flushQuizAbort = () => updateRun((current) => ({
      ...current,
      running: false,
      busy: false,
      quizStatus: current.quizStatus === "running" ? "error" : current.quizStatus,
    }));
    const controller = new AbortController();
    abortRef.current = controller;
    updateRun((current) => ({ ...current, busy: true, quizStatus: "running", error: null }));
    try {
      const score = await requestKnowledgeScore(configRef.current, controller.signal);
      if (token !== tokenRef.current) { flushQuizAbort(); return; }
      updateRun((current) => ({ ...current, quizStatus: "complete", quizScore: score, busy: false, running: false, finishedReason: `Campaign complete · knowledge test ${score}/50` }));
      getGame()?.setAgentControl(false);
    } catch (error) {
      if (token !== tokenRef.current) { flushQuizAbort(); return; }
      updateRun((current) => ({ ...current, quizStatus: "error", busy: false, running: false, error: String((error as Error)?.message ?? error), finishedReason: "Campaign complete · knowledge test needs retry" }));
      getGame()?.setAgentControl(false);
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const drive = async (token: number, game: Game, singleStep = false) => {
    let observedDead = false;
    while (token === tokenRef.current && runRef.current.running) {
      const state = game.getAgentSnapshot();
      if (!state.started) {
        // The human quit to the title mid-run — stop the AI instead of
        // burning API credits against a dead campaign.
        updateRun((current) => ({ ...current, running: false, busy: false, finishedReason: "Campaign ended — run stopped" }));
        game.setAgentControl(false);
        return;
      }
      if (state.dead) {
        if (!observedDead) updateRun((current) => ({ ...current, deaths: current.deaths + 1 }));
        observedDead = true;
        await sleep(400);
        continue;
      }
      observedDead = false;
      if (state.paused) {
        await sleep(250);
        continue;
      }
      if (state.victory && state.victoryDismissed) {
        if (runRef.current.scope === "full") await runKnowledgeQuiz(token);
        else {
          updateRun((current) => ({ ...current, running: false, finishedReason: "Campaign complete · takeover run" }));
          game.setAgentControl(false);
        }
        return;
      }
      if (state.victory && !state.victoryShown && !state.dialogue && !state.epilogue.active) {
        await sleep(300);
        continue;
      }
      if (runRef.current.step >= configRef.current.maxActions) {
        updateRun((current) => ({ ...current, running: false, finishedReason: `Action limit reached (${configRef.current.maxActions})` }));
        game.setAgentControl(false);
        return;
      }

      const controller = new AbortController();
      abortRef.current = controller;
      updateRun((current) => ({ ...current, busy: true, error: null }));
      game.setAgentThinking(true);
      let reply: Awaited<ReturnType<typeof requestAgentAction>> | null = null;
      try {
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            reply = await requestAgentAction(
              configRef.current,
              state,
              runRef.current.log.map((entry) => `#${entry.step} ${entry.action} -> ${entry.note}`),
              controller.signal,
              { deaths: runRef.current.deaths, failures: runRef.current.failures, apiErrors: runRef.current.apiErrors },
            );
            break;
          } catch (error) {
            if (token !== tokenRef.current) return;
            const message = String((error as Error)?.message ?? error);
            updateRun((current) => ({ ...current, apiErrors: current.apiErrors + 1 }));
            if (attempt === 1 || /API (400|401|403|404|429)/i.test(message)) throw error;
            await sleep(500);
          }
        }
      } catch (error) {
        if (token === tokenRef.current && !controller.signal.aborted) saveFailure(error, token);
        return;
      } finally {
        game.setAgentThinking(false);
        if (abortRef.current === controller) abortRef.current = null;
      }
      if (!reply || token !== tokenRef.current) return;
      const freshState = game.getAgentSnapshot();
      if (freshState.paused) {
        updateRun((current) => ({ ...current, busy: false }));
        continue;
      }
      if (freshState.dead) {
        updateRun((current) => ({ ...current, busy: false }));
        continue;
      }

      const result = game.performAgentAction(reply.action);
      const step = runRef.current.step + 1;
      const label = actionLabel(reply.action);
      const beforeMove = reply.action.action === "move_to" ? freshState.player : null;
      const moveTarget = reply.action.action === "move_to" ? { x: reply.action.x, z: reply.action.z } : null;
      updateRun((current) => ({
        ...current,
        step,
        busy: false,
        failures: current.failures + (result.ok ? 0 : 1),
        log: [...current.log, { step, action: label, thought: reply!.thought, ok: result.ok, note: result.note }].slice(-100),
      }));
      if (token !== tokenRef.current) return;
      if (singleStep || runSingleRef.current) {
        runSingleRef.current = false;
        updateRun((current) => ({ ...current, running: false, finishedReason: "Single AI action complete · control returned" }));
        game.setAgentControl(false);
        return;
      }
      const seconds = reply.action.action === "wait"
        ? Math.max(0.2, Math.min(freshState.prologue?.active ? 30 : 4, reply.action.seconds ?? (freshState.prologue?.active ? 30 : 1.5)))
        : reply.action.action === "move_to" || reply.action.action === "guard"
          ? reply.action.seconds ?? 1.5
          : 1.5;
      const duration = reply.action.action === "move_to" || reply.action.action === "guard" || reply.action.action === "wait"
        ? seconds * 1000
        : reply.action.action === "heavy" ? 1200
          : reply.action.action === "attack" ? 1050
            : reply.action.action === "cast" ? 1050
              : reply.action.action === "dodge" ? 800
                : reply.action.action === "heal" ? 850
                  : reply.action.action === "fast_travel" || reply.action.action === "map" ? 550 : 750;
      await sleep(Math.max(300, duration));
      if (beforeMove && moveTarget && token === tokenRef.current) {
        const afterMove = game.getAgentSnapshot().player;
        const moved = Math.hypot(afterMove.x - beforeMove.x, afterMove.z - beforeMove.z);
        const remaining = Math.hypot(moveTarget.x - afterMove.x, moveTarget.z - afterMove.z);
        const elevation = afterMove.y - beforeMove.y;
        const movementNote = `moved ${moved.toFixed(1)} units; ${remaining.toFixed(1)} from target; elevation ${beforeMove.y.toFixed(1)}→${afterMove.y.toFixed(1)} (${elevation >= 0 ? "+" : ""}${elevation.toFixed(1)})`;
        updateRun((current) => ({
          ...current,
          log: current.log.map((entry) => entry.step === step ? { ...entry, note: `${entry.note}; ${movementNote}` } : entry),
        }));
      }
    }
  };

  const validateConfig = () => {
    const current = configRef.current;
    if (!current.baseUrl.trim() || !current.model.trim() || !current.apiKey.trim()) {
      updateRun((state) => ({ ...state, error: "Enter an API URL, model, and API key first." }));
      return false;
    }
    return true;
  };

  const startRun = (scope: "full" | "takeover", singleStep = false) => {
    if (!validateConfig()) return;
    if (runRef.current.running) return;
    let game = scope === "full" ? restartGame() : getGame();
    if (!game) {
      updateRun((state) => ({ ...state, error: "The game is still loading. Try again in a moment." }));
      return;
    }
    if (scope === "full") game.start();
    else {
      if (!game.started || game.victory) {
        updateRun((state) => ({ ...state, error: "Takeover needs a live campaign. Start a game first." }));
        return;
      }
      // A paused world is fine to take over — the AI never uses the mouse.
      if (game.paused) game.setPaused(false, { pointerLock: false });
    }
    const snapshot = game.getAgentSnapshot();
    const baseline = scope === "takeover"
      ? campaignProgress(snapshot).checks.filter((check) => check.done).map((check) => check.label)
      : [];
    const now = Date.now();
    const token = ++tokenRef.current;
    runSingleRef.current = singleStep;
    game.setAgentControl(true);
    updateRun(() => ({
      ...EMPTY_RUN,
      running: true,
      scope,
      startedAt: now,
      baseline,
      step: singleStep ? runRef.current.step : 0,
      deaths: singleStep ? runRef.current.deaths : 0,
      failures: singleStep ? runRef.current.failures : 0,
      apiErrors: singleStep ? runRef.current.apiErrors : 0,
      log: singleStep ? runRef.current.log : [],
    }));
    void drive(token, game, singleStep);
  };

  const resumeRun = () => {
    if (!validateConfig() || runRef.current.running) return;
    const game = getGame();
    if (!game?.started || game.victory) {
      updateRun((state) => ({ ...state, error: "The current campaign cannot be resumed here. Start a fresh full run instead." }));
      return;
    }
    // Unpause without grabbing the pointer — the AI drives, clicks stay yours.
    if (game.paused) game.setPaused(false, { pointerLock: false });
    const token = ++tokenRef.current;
    runSingleRef.current = false;
    game.setAgentControl(true);
    updateRun((state) => ({ ...state, running: true, busy: false, startedAt: state.startedAt ?? Date.now(), finishedReason: null, error: null }));
    void drive(token, game);
  };

  const returnControl = () => {
    tokenRef.current++;
    abortRef.current?.abort();
    abortRef.current = null;
    runSingleRef.current = false;
    getGame()?.setAgentControl(false);
    updateRun((state) => ({ ...state, running: false, busy: false, finishedReason: "Control returned to player", error: null }));
  };

  const runQuizAgain = async () => {
    if (!validateConfig()) return;
    const flushQuizAbort = () => updateRun((current) => ({
      ...current,
      running: false,
      busy: false,
      quizStatus: current.quizStatus === "running" ? "error" : current.quizStatus,
    }));
    const token = ++tokenRef.current;
    const controller = new AbortController();
    abortRef.current = controller;
    updateRun((state) => ({ ...state, running: true, busy: true, quizStatus: "running", error: null }));
    try {
      const score = await requestKnowledgeScore(configRef.current, controller.signal);
      if (token !== tokenRef.current) { flushQuizAbort(); return; }
      updateRun((state) => ({ ...state, running: false, busy: false, quizStatus: "complete", quizScore: score, finishedReason: `Knowledge test complete · ${score}/50` }));
    } catch (error) {
      if (token !== tokenRef.current) { flushQuizAbort(); return; }
      updateRun((state) => ({ ...state, running: false, busy: false, quizStatus: "error", error: String((error as Error)?.message ?? error), finishedReason: "Knowledge test needs retry" }));
    } finally {
      abortRef.current = null;
    }
  };

  const setField = (field: keyof AshveilBenchmarkConfig, value: string | number) => setConfig((current) => ({ ...current, [field]: value }));

  if (!open) return null;
  const recent = [...run.log].slice(-7).reverse();
  const fieldClass = "w-full rounded-lg border border-[#c7a664]/30 bg-black/35 px-3 py-2.5 text-sm text-[#eee2c8] outline-none focus:border-[#f1d391]";
  const buttonClass = "min-h-11 rounded-md border border-[#d9bd80]/35 bg-[#201a14]/90 px-3 py-2 font-title text-[11px] tracking-[0.14em] text-[#ead7ad] transition hover:bg-[#3a2a18] disabled:cursor-not-allowed disabled:opacity-40";
  const currentSnapshot = progressSnapshot;

  return (
    <div className="pointer-events-auto fixed right-3 top-3 z-[80] w-[min(430px,calc(100vw-1.5rem))] font-sans text-[#e8e0cf]">
      <div className="flex max-h-[calc(100dvh-1.5rem)] flex-col gap-3 overflow-y-auto rounded-xl border border-[#b89a60]/45 bg-[#090807]/95 p-4 shadow-[0_25px_90px_rgba(0,0,0,0.82)] backdrop-blur-xl sm:p-5">
        <div className="flex items-start justify-between gap-3 border-b border-[#d9bd80]/20 pb-3">
          <div>
            <div className="font-title text-sm font-bold tracking-[0.22em] text-[#f0d89e]">ASHVEIL AI BENCHMARK</div>
            <div className="mt-1 text-xs text-[#c4b99f]/70">Full campaign · Ashbearer test run</div>
          </div>
          <button aria-label="Close AI benchmark" onClick={onClose} className={buttonClass + " min-h-9 px-3"}>✕</button>
        </div>

        <div className="sticky top-0 z-10 -mx-4 -mt-3 bg-[#100d0b]/95 px-4 pb-2 pt-3 shadow-[0_8px_16px_rgba(0,0,0,0.3)] backdrop-blur-xl sm:-mx-5 sm:px-5">
          {run.running ? (
            <button onClick={returnControl} className={buttonClass + " w-full border-[#c65e4b]/55 text-[#ffb0a0]"}>✋ RETURN CONTROL TO ME</button>
          ) : canResumeRun ? (
            <button onClick={resumeRun} disabled={run.busy} className={buttonClass + " w-full"}>↻ RESUME AI FROM HERE</button>
          ) : currentGameStarted && !currentSnapshot?.victory ? (
            <button onClick={() => startRun("takeover")} disabled={run.busy} className={buttonClass + " w-full"}>▶ AI TAKE OVER FROM HERE</button>
          ) : (
            <button onClick={() => startRun("full")} disabled={run.busy} className={buttonClass + " w-full border-[#e9c46b]/65 text-[#f6dda3]"}>▶ START FULL CAMPAIGN RUN</button>
          )}
          <div className="mt-1 text-center text-[10px] text-[#c4b99f]/60">
            {run.running ? "AI has the live controls · return any time" : "Full run starts from the beginning · takeover keeps current progress"}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-md border border-white/10 bg-white/[0.04] p-2"><div className="text-[9px] uppercase text-white/50">Actions</div><div className="mt-1 text-sm font-bold">{run.step}/{config.maxActions}</div></div>
          <div className="rounded-md border border-white/10 bg-white/[0.04] p-2"><div className="text-[9px] uppercase text-white/50">Deaths</div><div className="mt-1 text-sm font-bold text-[#ffaaa4]">{run.deaths}</div></div>
          <div className="rounded-md border border-white/10 bg-white/[0.04] p-2"><div className="text-[9px] uppercase text-white/50">Failures</div><div className="mt-1 text-sm font-bold text-[#ffaaa4]">{run.failures}</div></div>
        </div>
        <div className="flex items-center justify-between text-[11px] text-white/60">
          <span>{run.busy ? (run.quizStatus === "running" ? "Knowledge test" : "Model thinking · game paused") : run.running ? "AI playing" : "Idle"}</span>
          <span>{run.startedAt ? elapsedText : "--:--"} · API errors {run.apiErrors}</span>
        </div>
        <div className="rounded-lg border border-[#d9bd80]/20 bg-white/[0.035] p-3">
          <div className="flex items-center justify-between font-title text-[10px] tracking-[0.15em] text-white/65"><span>{run.scope === "takeover" ? "TAKEOVER STORY SCORE" : "CAMPAIGN STORY SCORE"}</span><span className="text-base text-[#f0d89e]">{progress?.score ?? 0}/{progress?.maxScore ?? 11}</span></div>
          {run.scope === "takeover" && <div className="mt-1 text-[10px] text-white/45">Only story milestones unfinished at handoff count.</div>}
          <div className="mt-2 max-h-32 space-y-1 overflow-y-auto pr-1">
            {(progress?.checks ?? []).map((check) => (
              <div key={check.label} className="flex justify-between gap-2 text-[10px]">
                <span className={check.done ? "text-[#b9e5a8]" : "text-white/50"}>{check.done ? "✓" : "·"} {check.label}</span>
                <span className="shrink-0 text-white/35">+{check.points}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-lg border border-[#d9bd80]/20 bg-white/[0.035] p-3">
          <div className="flex items-center justify-between font-title text-[10px] tracking-[0.15em] text-white/65"><span>OPEN-BOOK KNOWLEDGE TEST</span><span className="text-base text-[#f0d89e]">{run.quizStatus === "complete" ? `${run.quizScore}/50` : "—/50"}</span></div>
          <div className="mt-1 text-[10px] leading-relaxed text-white/45">A full run supplies the campaign guide and adds a 50-question test after the final boss. {run.quizStatus === "error" ? "The test failed; retry it below." : ""}</div>
          {run.quizStatus === "error" && <button onClick={() => void runQuizAgain()} disabled={run.busy} className={buttonClass + " mt-2 w-full"}>↻ RETRY KNOWLEDGE TEST</button>}
        </div>

        {(run.finishedReason || run.error) && <div role="status" className="rounded-md border border-white/10 bg-white/[0.04] p-2 text-xs text-[#dfd2b7]">{run.finishedReason}{run.error && <div className="mt-1 text-[#ffaaa4]">{run.error}</div>}</div>}
        <details className="rounded-lg border border-white/10 bg-white/[0.025] p-3 text-[10px] leading-relaxed text-white/50">
          <summary className="cursor-pointer font-title tracking-wider text-[#d9c79d]">MODEL SETTINGS &amp; ACTIONS</summary>
          <div className="mt-3 space-y-2">
            <label className="block">OpenAI-compatible API URL<input className={fieldClass + " mt-1"} value={config.baseUrl} onChange={(event) => setField("baseUrl", event.target.value)} placeholder="https://api.openai.com/v1" /></label>
            <p>For NVIDIA when running Ashveil locally, use <code>/api/nvidia/v1</code> and an available NVIDIA model. The bundled local server forwards requests to NVIDIA.</p>
            <label className="block">Model<input className={fieldClass + " mt-1"} value={config.model} onChange={(event) => setField("model", event.target.value)} placeholder="gpt-4o-mini" /></label>
            <label className="block">API key · kept until this page closes<input className={fieldClass + " mt-1"} type="password" value={config.apiKey} onChange={(event) => setField("apiKey", event.target.value)} placeholder="API key" /></label>
            <label className="flex items-center justify-between gap-2">Maximum AI actions<input className={fieldClass + " w-28 text-right"} type="number" min={1} max={5000} value={config.maxActions} onChange={(event) => setField("maxActions", Math.max(1, Math.min(5000, Number(event.target.value) || 1)))} /></label>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button onClick={() => startRun("full")} disabled={run.running || run.busy} className={buttonClass}>START FRESH RUN</button>
              <button onClick={() => startRun("takeover", true)} disabled={run.running || run.busy || !currentGameStarted} className={buttonClass}>STEP ONCE</button>
            </div>
            <div>Actions: move_to, interact, attack, heavy, dodge, jump, grapple, overdrive, filter, cast, heal, guard/parry, lock_on, weapon, relic slot, Grace map travel, wait, continue.</div>
          </div>
        </details>

        <div className="flex flex-col gap-1 rounded-lg border border-white/10 bg-black/25 p-3">
          <div className="font-title text-[9px] tracking-[0.18em] text-white/55">RECENT AI ACTIONS</div>
          {recent.length === 0 ? <div className="text-[10px] text-white/35">No actions yet.</div> : recent.map((entry) => (
            <div key={entry.step} className="border-b border-white/[0.06] pb-1 text-[10px] last:border-0"><span className={entry.ok ? "text-[#b9e5a8]" : "text-[#ffaaa4]"}>#{entry.step} {entry.action}</span><span className="text-white/45"> · {entry.note}</span></div>
          ))}
        </div>
      </div>
    </div>
  );
}
