# ASHVEIL — Throne of the Sundered Flame
## Full Expansion Master Plan — From Prototype to Open-World Souls-like
**Version:** 1.0 — 2026-08-10  
**Baseline:** Single-file 911KB WebGL procedural Souls-like, 4 acts, 3 biomes, 3 weapons, 13 graces  
**Target:** 20-30 hour open-world action-RPG, still zero external assets, still single-file dist <2MB, still 60fps on mid laptop

---

### 1. Executive Summary

Ashveil today proves you can ship a readable Souls-like with *no assets, only math*. The engine already has:

- Procedural terrain + platform collision + interior keep
- Procedural rig animation + weapon trails + particle VFX + additive bloom grade
- Procedural audio (WebAudio IR + granular)
- Quest beacon + dialogue state machine + grace fast-travel + map

**Expansion north star:** Keep the math-only ethos, but turn the 7.7k LOC prototype into a *systems-rich open world* where every hill has a reason. No asset store, no GLTF pipeline — extend proceduralism.

Three pillars for expansion:
1. **Depth of Mastery** — combat that rewards 50 hours, not 5 minutes
2. **Weight of World** — exploration that tells story without a quest marker every 30m
3. **Performance as Feature** — quality presets we just added become the foundation for shipping to low-end Chromebooks and high-end RTX.

---

### 2. Current Baseline (What We Have)

| System | Status | Notes |
|---|---|---|
| World | 420 radius, 410 wall, 3 biomes (Cinderwood, Frostmourn, Mirefen), 13 graces, keep 3 floors | Grass 16k instanced Lambert, no LOD yet |
| Combat | Light 3-chain + heavy, guard/parry, stamina/poise, Q bolt, 3 weapons | Single hitbox per swing, no hyperarmor |
| Enemies | 18 wretches/wardens + Malenkar + Vetrahl + Grull + Hollow Crown | 2 move sets small, boss 6 moves, streaming 80/220 |
| Progression | Runes, 3 villages upgrade blade/vigor/arcane rank 0-3 | No inventory, no armor sets |
| Quest | 10 stages linear with 2 bosses any-order act | Beacon pillar + HUD marker |
| Rendering | Three.js 0.180, ACES, PCF shadows 1536, UnrealBloom 0.38, custom GradeShader, light pool 4 | Adaptive DPR 0.5-1.15, basePixelRatio per quality preset |
| Audio | Procedural chords + wind + 10 SFX types | No VO |
| UI | HUD, minimap (fixed 205→410), full map, title/pause/death/victory (now dynamic), quality settings | No inventory |

Bottlenecks found in audit: platforms global leak (fixed), map scale stale (fixed), victory static (fixed), audio timer leak (fixed), adaptive disabled for ultra-low/x-high.

---

### 3. Vision — What Ashveil Becomes

**Elevator:** *Elden Ring meets Outer Wilds math.* A 3× larger world (radius 800→1200, not 420) where each biome is a *rule change*, not a recolor. Fire spreads in Cinderwood, ice is slippery + shattering in Frostmourn, mire is wading + reed stealth. The keep becomes a vertical hub with 7 floors + catacombs. 12 bosses, 40 mini-bosses, 60 lore stones that assemble into a language you learn.

**Fantasy that respects the player:** No minimap clutter. The world itself is the UI — wind moves grass toward graces, embers drift toward next objective, braziers flicker faster near secrets.

---

### 4. World Expansion — From 3 Biomes to 8

Keep existing 3, add 5 new, each = gameplay mutator + shader + prop language:

#### 4.1 New Biomes
1. **Emberglass Cliffs (West-North  -380, 180, r90)** — black glass terrain, reflective Standard metalness 0.8 roughness 0.1, sharp ridges. Mechanic: glass cracks under heavy slam, creates shockwave path.
2. **Whispering Barrowfields (East-South  200, -260, r85)** — tall wheat instanced (reuse grass blade geo with height 1.8), volumetric fog planes. Mechanic: stealth — enemies lose aggro in wheat, you can crouch (new input Ctrl).
3. **Choir's Maw (center-south  0, -420, r110)** — the Sundered Tree roots, giant tendril meshes, emissive veins. Final dungeon entrance. Mechanic: gravity wells that pull projectiles.
4. **Hollow Salt Flats (North -70, 340, r95)** — white crust, high reflectivity, mirage heat haze shader pass (cheap screen UV wobble). Mechanic: stamina drains faster, runes glint visible at distance.
5. **Veilwood (North-East  320, 220, r90)** — living trees with vertex wind stronger (1.8), bioluminescent spores (points). Mechanic: tree branches are platforms you can climb — parkour.

#### 4.2 Technical Implementation per Biome (zero assets)
- Define `BIOMES` entry with `x,z,r, type`
- In `terrainHeight`, add biome-specific modulation: e.g., Emberglass adds `ridged*cliff*glassFactor`
- In `world.buildBiomeProps()`, add new case generating instanced props + unique material (use existing bark/ice mat templates)
- In `biomeWeights`, blend vertex colors already — extend
- In `World.update`, biome-specific fog color lerp

#### 4.3 Dungeons — Reuse keep tower tech
- Keep currently has `addPlatform` slab + stair ramp. Generalize to `DungeonBuilder` that takes seed + rect and generates rooms via BSP, each room = slab + walls instanced + colliders.
- Each dungeon: entrance grace, 3-5 rooms, 1 mini-boss, 1 lore stone, 1 upgrade shrine.
- 8 dungeons total.

#### 4.4 Keep Vertical Expansion
- From 3 floors → 7: add `f4=30, f5=37, f6=44, f7=51` (catacombs below base = 2)
- Add library, rookery (hawk launch point for gliding prototype), undercroft forge with anvil that visually reforges blade (scale bladeLength).
- Keep becomes player housing: place trophies (boss heads procedural icosa).

---

### 5. Narrative Expansion — Acts 5-7

Current acts: 0-3 tutorial, 3-4 Malenkar, 5-7 Choir, 8 Hollow Crown, 9 epilogue.

**Expand to:**

- **Act 5 (now Act 5-6):** Choir hunt in any order, but each boss changes world: Vetrahl death → snow melt reveals Frostmourn grace + frozen lake becomes swimmable; Grull death → mire drains, reveals 2 dungeons.
- **Act 7:** The Salt Seer — new NPC in Salt Flats, gives player a choice: keep all shards (power) or scatter (world heals). Choice affects final boss moveset.
- **Act 8:** Hollow Crown, but now 3 phases with memory of previous runes spent — if you fed Aldric many runes, he is harder.
- **Act 9:** After finale, New Game+ flag stored in localStorage: world keeps graces but enemies scale `hp *= 1.35^NG`, new weapon "Choirbrand" unlocked.
- **Epilogue:** Wander + 12 hidden “echo” NPCs that only appear at night (uses existing dayPhase).

**Lore stones → Language:** Each stone gives a glyph. Collect all 20 → you can read Choir inscriptions on arena pillars, unlocking secret ending.

**Dialogue system upgrade:**
- From linear `idx++` to tree with choices: `DIALOGUE[kind] = { lines:[], choices?:{text,next}[] }`
- Add speaker portraits procedural canvas (circle + rune).

---

### 6. Gameplay Systems Expansion

#### 6.1 Combat Depth
- **Weapons:** From 3 → 9. Add: `scythe` (bleed buildup), `twin daggers` (critical from behind), `greatclub` (hyperarmor), `spear` (long thrust + shield), `catalyst` (pure magic, no melee), `choirbrand` (NG+). Each needs `WEAPON_CONFIG` entry + rig variant — reuse existing rig builder, only new trail colors.
- **Moves:** Add running attack (`move + attack` while sprint), rolling attack, backstab (detect enemy unaware dot < -0.7). Add charged heavy hold E 1s → 2× damage.
- **Poise 2.0:** Give player hyperarmor during heavy windows, enemy hyperarmor visualized by glowMat opacity.
- **Stamina 2.0:** Exhausted state (we added UI) now actually locks actions for 0.8s + camera shake.
- **Lock-on 2.0 (we just shipped v1):** Next: soft lock reticle drifts, hard lock camera. Add lock-on cycling: pressing TAB cycles next target by angular distance, not just nearest. Add freeing if target dies.
- **Magic Schools:** Currently single bolt. Add 3: Bolt (cost 22 fp), Frost Shard (slow), Mire Vine (root). Use same projectile system with different `gravity`, `explode`, `color`.

#### 6.2 Progression
- **Rune Economy 2.0:** Bloodstain already exists. Add multipliers: killing spree without grace multiplies runes 1.1× up to 2×.
- **Skill Tree:** Simple 3 branches (blade/vigor/arcane) visualized as canvas nodes in pause menu, each rank costs runes and unlocks passive: e.g., vigor rank4 = +15% flask heal.
- **Armor:** Procedural color shift of existing metal/cloth mats — add `armorSet` that modifies `bulk`, `moveSpeed`, `poise`. No new models, just material params.
- **Flasks:** Allow allocation: 5 total, split HP/FP at grace (like Elden).

#### 6.3 Systems
- **Crouch & Stealth:** Ctrl → reduce collider radius 0.5→0.3, moveSpeed 0.5×, aggroRange 0.4×, grass hides.
- **Climbing:** Reuse `platforms` — if slope <0.5 and holding W + Space near wall, increase vertical.
- ** crafting (Ashweave):** Collect `Ember Shards` from grass (reuse flower pickup). At anvil: craft throwable oil pot (projectile with gravity).
- **Photo Mode:** Pause + P → hide HUD, free camera orbit (reuse god-mode flight).

#### 6.4 Co-op Ghosts
- No live multiplayer (would break single-file ethos). Instead, async ghosts: record player path + fights as JSON in localStorage, show as translucent rigs in other players' worlds. Implement via `GhostManager`.

---

### 7. Technical Roadmap

#### Phase 0 — Foundation (DONE)
- [x] Map scale fix, victory dynamic, platforms instance, audio dispose, stamina UI
- [x] Quality presets ultra-low → x-high, live switching, localStorage, HUD display
- [x] Lock-on without pointer lock, 3-pass search

#### Phase 1 — Engine Hardening (2 weeks)
- **Save/Load:** localStorage `ashveil_save` JSON: questStage, runes, discoveredGraces, upgrades, loreRead, quality, position. On `Game` ctor load, on `discoverGrace`/`upgrade`/`kill` save. Add `New Game` vs `Continue` in title.
- **Input Remapping:** `src/game/input.ts` extract from engine: map action→key, allow rebind UI in Settings.
- **ECS Lite:** Move `NPC.update` logic into `AISystem` to avoid per-enemy closure alloc.
- **LOD & Culling:** Grass instance culling by distance already via `veryFar`, but add frustum cull for ruins. Reduce SEG 288→216 for terrain on low quality.
- **Shadow Cascade:** Sun shadow far 300 → adaptive based on quality preset already.

#### Phase 2 — World 2× (3 weeks)
- Increase `WORLD.radius` 420→700, wall 410→680. Add 5 new biomes entries. Generate props.
- Implement `DungeonBuilder` class.
- Expand keep to 7 floors.
- Add grace network 13→26.

#### Phase 3 — Combat 2.0 (3 weeks)
- Add 6 new weapons, new moves (running/backstab/charged).
- Magic schools.
- Crouch/stealth.
- Rebalance `WEAPON_CONFIG`.

#### Phase 4 — Progression & UI (2 weeks)
- Inventory UI (React): left list weapons, right stats. No need for Three changes.
- Skill tree canvas.
- Flask allocation.
- Lore codex that assembles glyphs.

#### Phase 5 — Polish & Shipping (2 weeks)
- Build size budget: keep < 1.2MB gz (currently 252KB). Each new biome adds <20KB JS, not textures.
- Add PWA manifest so game installable.
- Add `stats.js` toggle in pause for perf.
- Final QA on Chromebook (ultra-low), MacBook Air (medium), RTX laptop (x-high).

**Total:** ~12 weeks solo, 6 weeks with 2 devs.

---

### 8. Content Pipeline (Math-Only)

Rule: No external asset pipeline. Every new visual must be a function.

- **New prop:** function that takes `seed, x, z, scale` and returns `Group` or `InstancedMesh`. Use `makeRng(seed)` for determinism.
- **New material:** derive from existing `MeshStandardMaterial` with color/roughness/metalness/emissive, or `ShaderMaterial` clone.
- **New VFX:** extend `Particles.emit` with new color palette.
- **New SFX:** add method to `AudioEngine` using existing `env` helper.

Document each in `props_catalog.md`.

---

### 9. Audio & Music Expansion

- Current: 4 chords, boss pulse.
- Expansion: 8 biomes → 8 chord sets, crossfade by `biomeWeights`. Use same `playChord` but lerp freqs.
- Add VO: use Web Speech API synthesis as placeholder, or keep text-only with choir shimmer.
- Weather audio: ash → lowpass wind, ember → crackle particles.

---

### 10. UI/UX Roadmap

- Title: Continue + New Game + Settings + Codex
- Pause: Resume + Settings (quality + keybinds) + Inventory + Map + Lore + Quit
- HUD: Add boss phase dots, add rune multiplier, add buff icons (bleed/frost)
- Map: Fog of war — discovered tiles, not just graces. Use canvas overlay.
- Settings we just built: extend with `FOV slider`, `Motion Blur toggle`, `Grain toggle`, `Vignette`.

---

### 11. Monetization & Distribution (Optional)

- Keep single-file `index.html` dist — can be hosted on itch.io, IPFS, or as NFT-gated? No.
- PWA → installable, offline.
- Patreon for biome votes.

---

### 12. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| World 2× kills FPS | LOD, grass toggle in ultra-low, `veryFar` 220→180, instance culling, quality presets already |
| Save corruption | Version save format + migration, store backup in `localStorage.ashveil_save_bak` |
| Scope creep | Each biome = 1 week max, cut if over |
| Lock-on feels bad without pointer lock | We fixed 3-pass search, add aim assist curve 0-100% slider in settings |

---

### 13. Milestone Checklist — Next 30 Days

**Week 1:**
- [ ] Save/Load + Continue button
- [ ] Input remap UI
- [ ] Crouch + stealth grass
- [ ] 1 new biome (Emberglass Cliffs)

**Week 2:**
- [ ] 2 more biomes + 2 dungeons
- [ ] Weapon: Scythe + Spear
- [ ] Magic: Frost Shard
- [ ] Keep floor 4-5

**Week 3:**
- [ ] Keep floors 6-7 + catacombs
- [ ] Skill tree UI
- [ ] Inventory + armor tint
- [ ] Lore codex glyphs

**Week 4:**
- [ ] Final 2 biomes + boss
- [ ] NG+ flag + Choirbrand
- [ ] PWA + performance QA

---

### 14. Code Tasks — Immediate (Copy-Paste Ready)

- `engine.ts`: Add `save()` / `load()` calling `localStorage`
- `world.ts`: Add `buildEmberglass()` method
- `actors.ts`: Add `WEAPON_CONFIG.scythe`
- `terrain.ts`: Expand `BIOMES` + `biomeWeights`
- `Screens.tsx`: Add `InventoryScreen`

---

### 15. Why This Plan Works

Ashveil's strength is *constraint*. By staying math-only, you avoid asset pipeline hell and keep dist small. Each expansion reuses existing tech: platforms for dungeons, instanced meshes for biomes, projectile system for magic, trail for weapon FX. Quality presets we just shipped are the lever that lets you ship to potato laptops and RTX rigs without branching.

**You don't need a team of 20. You need 12 weeks and discipline.**

---

### Appendix — Quality Presets (Shipped)

```ts
ultralow: DPR 0.55, 256 shadows, no bloom, no mist, adaptive:false
low:      DPR 0.8,  512 shadows, bloom 0.18
medium:   DPR 1.2,  1024 shadows, bloom 0.38 (default)
high:     DPR 1.5,  1536 shadows, bloom 0.46
xhigh:    DPR 2.0,  2048 shadows, bloom 0.58, adaptive:false
```

Saved in `localStorage.ashveil_quality`, applied live, HUD shows current.

Lock-on now: TAB/T/V/MiddleClick, 3-pass nearest search, auto-request pointer lock, shows banner, works without mouse lock.

---

*End of plan. Forge the Ashveil.*
