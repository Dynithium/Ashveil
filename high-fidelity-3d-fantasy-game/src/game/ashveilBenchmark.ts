import type { AshveilAgentAction, Game } from "./engine";
import { WORLD } from "./terrain";
import { ASHVEIL_CAMPAIGN_GUIDE, buildAshveilQuizPrompt } from "./ashveilQuiz";

export type AshveilBenchmarkConfig = {
  baseUrl: string;
  model: string;
  apiKey: string;
  maxActions: number;
};

export type AshveilBenchmarkSnapshot = ReturnType<Game["getAgentSnapshot"]>;

export type BenchmarkCheck = { label: string; done: boolean; points: number };

export function campaignProgress(snapshot: AshveilBenchmarkSnapshot, baseline: string[] = []) {
  const stage = snapshot.questStage;
  const boss = (role: string) => snapshot.bosses.find((item) => item.role === role);
  const checks: BenchmarkCheck[] = [
    { label: "Kinter reached King Aldrich", done: !!snapshot.prologue?.complete, points: 1 },
    { label: "King Aldrich's briefing", done: stage >= 1, points: 1 },
    { label: "The King's Trial â€” completed", done: stage >= 3, points: 1 },
    { label: "The Rusted Colossus defeated", done: !!snapshot.bosses.find((item) => item.name === "THE RUSTED COLOSSUS")?.dead, points: 1 },
    { label: "The Hollow Captain defeated", done: !!snapshot.bosses.find((item) => item.name === "THE HOLLOW CAPTAIN")?.dead, points: 1 },
    { label: "The Ash-Stalker defeated", done: !!snapshot.bosses.find((item) => item.name === "THE ASH-STALKER")?.dead, points: 1 },
    { label: "The Prism Warden defeated", done: !!snapshot.bosses.find((item) => item.name === "THE PRISM WARDEN")?.dead, points: 1 },
    { label: "The Molten Leviathan defeated", done: !!snapshot.bosses.find((item) => item.name === "THE MOLTEN LEVIATHAN")?.dead, points: 1 },
    { label: "The Gale Sentinel defeated", done: !!snapshot.bosses.find((item) => item.name === "THE GALE SENTINEL")?.dead, points: 1 },
    { label: "The Iron Forgemaster defeated", done: !!snapshot.bosses.find((item) => item.name === "THE IRON FORGEMASTER")?.dead, points: 1 },
    { label: "The Pale Herald defeated", done: !!snapshot.bosses.find((item) => item.name === "THE PALE HERALD")?.dead, points: 1 },
    { label: "Malenkar defeated", done: snapshot.victory || (!!boss("main")?.dead && stage >= 9), points: 1 },
    { label: "Kinter becomes King of Uoka", done: snapshot.victory, points: 1 },
  ];
  const baselineSet = new Set(baseline);
  const eligible = checks.filter((check) => !baselineSet.has(check.label));
  const score = eligible.reduce((sum, check) => sum + (check.done ? check.points : 0), 0);
  const maxScore = eligible.reduce((sum, check) => sum + check.points, 0);
  return { checks, score, maxScore };
}

function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((part) => {
    if (typeof part === "string") return part;
    if (!part || typeof part !== "object") return "";
    const text = (part as { text?: unknown }).text;
    return typeof text === "string" ? text : "";
  }).filter(Boolean).join("\n");
}

function extractJson(text: string): any | null {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/```(?:json)?/gi, "").trim();
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first < 0 || last <= first) return null;
  try { return JSON.parse(cleaned.slice(first, last + 1)); } catch { return null; }
}

export function validateAgentAction(value: unknown): AshveilAgentAction | null {
  if (!value || typeof value !== "object") return null;
  let raw = value as Record<string, unknown>;
  if (typeof raw.action === "string") {
    const call = raw.action.trim().match(/^(move_to|attack|heavy|dodge|jump|grapple|overdrive|filter|cast|heal|guard|interact|lock_on|weapon|relic|map|fast_travel|wait|continue)\s*\((.*)\)$/i);
    if (call) {
      const action = call[1].toLowerCase();
      const positional: Record<string, string[]> = {
        move_to: ["x", "z", "seconds", "sprint"], guard: ["seconds"], lock_on: ["target_index"],
        weapon: ["weapon"], relic: ["slot"], fast_travel: ["grace_index"], wait: ["seconds"],
      };
      const args: Record<string, unknown> = {};
      const parts = call[2].trim() ? call[2].split(",").map((part) => part.trim()) : [];
      let position = 0;
      for (const part of parts) {
        const named = part.match(/^([a-z_]+)\s*=\s*(.*)$/i);
        const key = named?.[1] ?? positional[action]?.[position++];
        if (!key) continue;
        const text = (named?.[2] ?? part).trim().replace(/^(["'])(.*)\1$/, "$2");
        const parsed = text === "true" ? true : text === "false" ? false : text !== "" && Number.isFinite(Number(text)) ? Number(text) : text;
        args[key] = parsed;
      }
      raw = { ...raw, ...args, action };
    }
  }
  const secondsLimit = raw.action === "wait" ? 30 : 4;
  const seconds = typeof raw.seconds === "number" && Number.isFinite(raw.seconds) ? Math.max(0.2, Math.min(secondsLimit, raw.seconds)) : undefined;
  switch (raw.action) {
    case "move_to":
      if (typeof raw.x !== "number" || typeof raw.z !== "number" || !Number.isFinite(raw.x) || !Number.isFinite(raw.z)) return null;
      if (Math.abs(raw.x) > WORLD.wall || Math.abs(raw.z) > WORLD.wall) return null;
      return { action: "move_to", x: raw.x, z: raw.z, seconds, sprint: raw.sprint === true };
    case "attack": case "heavy": case "dodge": case "jump": case "grapple": case "overdrive": case "filter": case "cast": case "heal": case "interact": case "map": case "continue": case "wait":
      return { action: raw.action, seconds } as AshveilAgentAction;
    case "guard": return { action: "guard", seconds };
    case "lock_on":
      return raw.target_index === undefined || Number.isInteger(raw.target_index)
        ? { action: "lock_on", target_index: raw.target_index as number | undefined }
        : null;
    case "weapon":
      return raw.weapon === "greatsword" || raw.weapon === "twinblades" || raw.weapon === "halberd"
        ? { action: "weapon", weapon: raw.weapon }
        : null;
    case "relic": return raw.slot === 0 || raw.slot === 1 ? { action: "relic", slot: raw.slot } : null;
    case "fast_travel":
      return Number.isInteger(raw.grace_index) ? { action: "fast_travel", grace_index: raw.grace_index as number } : null;
    default: return null;
  }
}

export async function requestAgentAction(
  config: AshveilBenchmarkConfig,
  snapshot: AshveilBenchmarkSnapshot,
  recentActions: string[],
  signal: AbortSignal,
  runStats: { deaths: number; failures: number; apiErrors: number } = { deaths: 0, failures: 0, apiErrors: 0 },
) {
  const endpoint = config.baseUrl.trim().replace(/\/+$/, "") + "/chat/completions";
  const observation = [
    "LIVE GAME STATE (JSON):",
    JSON.stringify(snapshot),
    `BENCHMARK STATUS: deaths=${runStats.deaths}, failed actions=${runStats.failures}, model/API errors=${runStats.apiErrors}. If deaths are increasing, change the route or clear the nearby hostile before trying again.`,
    "RECENT ACTIONS:",
    recentActions.slice(-8).join("\n") || "(none)",
  ].join("\n\n");
  const campaignContext = snapshot.prologue?.active
    ? ""
    : `Campaign guide:\n${ASHVEIL_CAMPAIGN_GUIDE}\n`;
  const system = `You are the player in Ashveil: Throne of the Sundered Flame, controlling a real-time 3D action RPG. Complete the full campaign and reach the post-victory free-roam state. Use only the current observation; it is refreshed after every action.

${campaignContext}

Prologue rules ("The Long Fall"):
- The campaign opens ten years before, as Kinter, before he or anyone is the Ashbearer. While PROLOGUE.active is true you are inside this authored opening and must follow PROLOGUE.objective (also mirrored in objective) one beat at a time.
- On a beat where PROLOGUE.beatId is cinematic (last-night, arrival, rockslide, waterfall, lyekai), the scene plays itself. Use wait(seconds) for up to 30 seconds to let it advance efficiently; move_to is ignored there. Never try to skip.
- In any prologue beat, if PROLOGUE.prompt is visible, interact immediately. If dialogue is open, interact advances exactly one line.
- On a traverse beat (border, route, shore, escort, castle), walk toward the golden beacon using move_to, and use interact when PROLOGUE.prompt shows. The border's cairn, sign and feather are optional. If a dialogue is open, interact advances one line.
- The meeting with Aldrich appears after the opening beats and has an additional minimum-time safety gate. Stay on the current beat's objective until its prompt appears; do not loop on failed actions.
- Until PROLOGUE.complete is true, do not attack, heavy, cast, heal, guard, lock_on, weapon, map, or fast_travel. Dodge is available only on the border path. There is no combat during the prologue.
- The prologue ends only when Kinter meets King Aldrich; once PROLOGUE.complete is true, resume the normal campaign guide above (Speak with King Aldrich for the briefing).

Action rules:
- Return exactly one JSON object with the bare action name and parameters in separate fields. Example: {"thought":"brief reason","action":"move_to","x":-7.6,"z":129,"seconds":4,"sprint":true}. Never put parentheses or arguments inside the action string. No markdown.
- Supported actions: move_to(x,z,seconds,sprint), attack, heavy, dodge, jump, grapple, overdrive, filter, cast, heal, guard(seconds), interact, lock_on(target_index), weapon(weapon), relic(slot), map, fast_travel(grace_index), wait(seconds), continue. relic(slot) draws assigned relic slot 0 or 1; weapon(greatsword) returns to the Second Blade. Relic attacks and Phase-Step use core energy. Filter consumes one spare canister to replace a worn filter; check filterCondition and filterHazard. Grapple uses core energy and aims toward the locked target or camera; Overdrive requires the Leviathan Shard. Sky-Step permits one aerial dodge after jumping. Prologue waits can be up to 30 seconds; other waits should be 4 seconds or less.
- For a discovered Grace, use fast_travel(grace_index) directly for a long journey; it opens the map and travels in one action. Avoid opening the map by itself during the benchmark.
- move_to moves through normal walking physics toward a world-space X/Z target for at most 4 seconds; it does not teleport and automatically stops within 1.2 units of the target. Choose enough seconds for the distance, then re-check your position. If progress stalls, choose a waypoint around the obstacle.
- During the prologue, wait can advance up to 30 seconds per action; outside it, keep wait to 4 seconds or less so enemies cannot get free attacks while time passes.
- Interact advances one open dialogue line. When PROMPT is none, interact will fail. If a dialogue is open, advance it before moving. Only speak to Aldrich when the current quest stage calls for him; ignore his proximity prompt during the Hall, Terrace, and final boss objectives.
- Combat: approach the target, lock onto its index, then attack/heavy and dodge when useful. Heal with R when health is low. Do not attack non-hostile NPCs.
- Boss combat: compare the boss's current distance before every strike. If it is over 4 units away, move toward its live x/z position first; do not waste attacks outside melee range. When within 4 units and stamina is at least 40, prefer heavy attacks for damage; use light attacks only when stamina is lower. Dodge an active lunge/telegraph, and heal when HP is below 45%.
- During long travel toward a boss, prioritize the beacon: use a discovered Grace directly when it saves substantial distance, otherwise move with sprint=true. Do not spend a long fight on ordinary Wretches or Wardens that are not quest objectives; sprint/dodge around them while HP is above 45%, and fight only if one physically blocks the route or HP falls below 45%. Reserve lock_on and sustained attacks for required bosses. If the death count rises, change your approach and use a discovered Grace or clear the blocker.
- After any death, inspect the discovered Grace list and fast_travel to the closest discovered site to the current objective before walking again. For Malenkar specifically, if Roadside Grace (index 1) or Cathedral Approach (index 2) is discovered, travel directly to the one closer to the boss; walk the keep-to-cathedral road only if neither southern Grace is discovered.
- During the King's Trial, fight the enemy named KING ALDRICH — THE TRIAL. Land three strikes, use dodge, then parry or land five more strikes. He cannot kill Kinter; continue after he helps you up. Lock onto his enemy index and follow the current objective.
- Older saved campaigns may still have Hall of Blades and Terrace objectives. For those saves, use keepRoute stair waypoints and follow the objective.
- Once the Trial is complete, leave the keep and follow the beacon toward the Ashveil.
- After the King's Trial, the Ashveil opens fully. The campaign is: hunt the Shard guardians in ANY order to collect Shards of Light, or rush Malenkar at the Black Citadel to the south. The guardians are the Cathedral Road guardians; each shows up as a boss on the map and on the snapshot.
- The finale: Malenkar waits at (0, -18) in the Black Citadel. The moment Malenkar takes the field his ward wakes — three CONDUIT PYLONS rise around the dais; while any pylon stands your damage is gutted. Break the pylons. At half health Malenkar rips the cables and takes the storm into himself. When Malenkar falls to a quarter of his health King Aldrich charges into the fight â€” the narrator explains that Aldrich dies in this fight either way. Keep fighting after the narrator finishes; Malenkar's death ends the campaign as King of Uoka.
- After the coronation narration, the playable epilogue has three responsibilities. Follow the live beacon to the Relay, frontier plan, and council in turn, and interact to advance each conversation. After the final narration, continue from the victory screen.
- Do not choose fast_travel unless that Grace is listed as discovered. Do not repeat an action that failed without changing your position or approach.
- Check the recent action notes and player elevation after every move_to. Enemies on another floor may be close in X/Z but cannot be hit; compare player.y with the target's y/verticalGap and use the stair landings to reach the correct floor. If a move reports little movement, do not repeat that waypoint; choose the next listed route waypoint or steer around the obstruction.
- Never stop or quit early. If the victory screen appears, choose continue to complete the benchmark.

Valid move_to coordinates must stay within world bounds (-410 to 410).`;
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener("abort", abort, { once: true });
  const timeout = window.setTimeout(abort, 180_000);
  try {
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify({
          model: config.model,
          temperature: 0.2,
          max_tokens: 1000,
          messages: [{ role: "system", content: system }, { role: "user", content: observation }],
        }),
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted && !signal.aborted) throw new Error("Model request timed out after 180 seconds.");
      throw error;
    }
    if (!response.ok) throw new Error(`API ${response.status}: ${(await response.text()).slice(0, 240)}`);
    const data = await response.json();
    const message = data?.choices?.[0]?.message;
    const text = contentText(message?.content) || (typeof message?.reasoning_content === "string" ? message.reasoning_content : "");
    const parsed = extractJson(text);
    const action = validateAgentAction(parsed);
    if (!action) throw new Error(`Model returned an invalid Ashveil action: ${text.slice(0, 180)}`);
    return { action, thought: typeof parsed.thought === "string" ? parsed.thought : "" };
  } finally {
    window.clearTimeout(timeout);
    signal.removeEventListener("abort", abort);
  }
}

export async function requestKnowledgeScore(config: AshveilBenchmarkConfig, signal: AbortSignal): Promise<number> {
  const { prompt, answers } = buildAshveilQuizPrompt();
  const endpoint = config.baseUrl.trim().replace(/\/+$/, "") + "/chat/completions";
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener("abort", abort, { once: true });
  const timeout = window.setTimeout(abort, 180_000);
  try {
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify({
          model: config.model,
          temperature: 0,
          max_tokens: 2500,
          messages: [
            { role: "system", content: "You are taking an open-book 50-question comprehension test about Ashveil. Use only the supplied campaign reference. Answer all questions and return exactly one JSON object: {\"answers\":[0,1,...]} with exactly 50 integer choices, using each question's zero-based option index. No prose or markdown." },
            { role: "user", content: prompt },
          ],
        }),
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted && !signal.aborted) throw new Error("Quiz request timed out after 180 seconds.");
      throw error;
    }
    if (!response.ok) throw new Error(`Quiz API ${response.status}: ${(await response.text()).slice(0, 240)}`);
    const data = await response.json();
    const message = data?.choices?.[0]?.message;
    const text = contentText(message?.content) || (typeof message?.reasoning_content === "string" ? message.reasoning_content : "");
    const parsed = extractJson(text);
    if (!Array.isArray(parsed?.answers) || parsed.answers.length !== 50 || !parsed.answers.every((answer: unknown) => Number.isInteger(answer) && (answer as number) >= 0 && (answer as number) <= 3)) {
      throw new Error("Quiz reply must contain exactly 50 integer choices from 0 to 3.");
    }
    return parsed.answers.reduce((score: number, answer: number, index: number) => score + (answer === answers[index] ? 1 : 0), 0);
  } finally {
    window.clearTimeout(timeout);
    signal.removeEventListener("abort", abort);
  }
}

export function actionLabel(action: AshveilAgentAction) {
  return action.action === "move_to"
    ? `move_to(${action.x.toFixed(0)}, ${action.z.toFixed(0)}, ${action.seconds ?? "auto"})`
    : action.action === "fast_travel"
      ? `fast_travel(Grace ${action.grace_index})`
      : action.action === "weapon"
        ? `weapon(${action.weapon})`
        : action.action === "lock_on"
          ? `lock_on(${action.target_index ?? "nearest"})`
          : action.action;
}
