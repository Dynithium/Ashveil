// ---------------------------------------------------------------------------
// ASHVEIL — 100% procedural audio (WebAudio). No sample assets.
// Orchestral-ish drone score + granular combat FX.
// ---------------------------------------------------------------------------

export class AudioEngine {
  ctx: AudioContext | null = null;
  master!: GainNode;
  musicBus!: GainNode;
  sfxBus!: GainNode;
  reverb!: ConvolverNode;
  reverbSend!: GainNode;
  private noiseBuf!: AudioBuffer;
  private started = false;
  private windGain?: GainNode;
  private musicTimer?: number;
  private chordIx = 0;
  private intensity = 0;
  enabled = true;

  init() {
    if (this.started) return;
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    const ctx = this.ctx;
    this.started = true;

    this.master = ctx.createGain();
    this.master.gain.value = 0.85;
    this.master.connect(ctx.destination);

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 22;
    comp.ratio.value = 5;
    comp.attack.value = 0.005;
    comp.release.value = 0.28;
    comp.connect(this.master);

    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0.5;
    this.musicBus.connect(comp);

    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 0.9;
    this.sfxBus.connect(comp);

    // ---- cathedral reverb (procedural impulse) ----
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.makeImpulse(4.2, 2.4);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.5;
    this.reverbSend.connect(this.reverb);
    this.reverb.connect(comp);

    // ---- noise buffer ----
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    this.startWind();
    this.startMusic();
  }

  private makeImpulse(seconds: number, decay: number) {
    const ctx = this.ctx!;
    const rate = ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const ch = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * (1 - t * 0.2);
      }
    }
    return buf;
  }

  resume() {
    this.init();
    if (this.ctx?.state === "suspended") this.ctx.resume();
  }

  setEnabled(v: boolean) {
    this.enabled = v;
    if (this.master) this.master.gain.value = v ? 0.85 : 0;
  }

  /** 0 = exploring, 1 = boss fight */
  setIntensity(v: number) {
    this.intensity = v;
  }

  private noiseSource(): AudioBufferSourceNode {
    const s = this.ctx!.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = true;
    return s;
  }

  // ------------------------------ ambience ---------------------------------
  private startWind() {
    const ctx = this.ctx!;
    const src = this.noiseSource();
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 380;
    bp.Q.value = 0.6;
    const g = ctx.createGain();
    g.gain.value = 0.05;
    src.connect(bp).connect(g);
    g.connect(this.musicBus);
    g.connect(this.reverbSend);
    src.start();
    this.windGain = g;
    void this.windGain;

    // slow gust LFO
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lg = ctx.createGain();
    lg.gain.value = 0.035;
    lfo.connect(lg).connect(g.gain);
    lfo.start();

    const lfo2 = ctx.createOscillator();
    lfo2.frequency.value = 0.031;
    const lg2 = ctx.createGain();
    lg2.gain.value = 260;
    lfo2.connect(lg2).connect(bp.frequency);
    lfo2.start();
  }

  // -------------------------------- music ----------------------------------
  private chords = [
    [55.0, 82.41, 110.0, 164.81, 196.0], // Am-ish
    [49.0, 73.42, 98.0, 146.83, 174.61], // G
    [43.65, 65.41, 87.31, 130.81, 155.56], // F
    [58.27, 87.31, 116.54, 174.61, 207.65], // Bb
  ];

  private startMusic() {
    const step = () => {
      if (!this.ctx || !this.started) return;
      this.playChord(this.chords[this.chordIx % this.chords.length]);
      this.chordIx++;
      if (this.intensity > 0.5) this.playBossPulse();
      if (!this.started) return;
      this.musicTimer = window.setTimeout(step, this.intensity > 0.5 ? 4200 : 9200);
    };
    step();
  }

  private playChord(freqs: number[]) {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const dur = this.intensity > 0.5 ? 5.0 : 10.5;
    const bus = ctx.createGain();
    bus.gain.value = 0;
    bus.connect(this.musicBus);
    bus.connect(this.reverbSend);
    bus.gain.setValueAtTime(0.0001, t);
    bus.gain.linearRampToValueAtTime(0.16 + this.intensity * 0.16, t + dur * 0.32);
    bus.gain.linearRampToValueAtTime(0.0001, t + dur);

    freqs.forEach((f, i) => {
      for (let d = 0; d < 2; d++) {
        const o = ctx.createOscillator();
        o.type = i > 2 ? "triangle" : "sawtooth";
        o.frequency.value = f * (d === 0 ? 1 : 1.005);
        const g = ctx.createGain();
        g.gain.value = (i > 2 ? 0.06 : 0.11) / (1 + i * 0.35);
        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.setValueAtTime(300, t);
        lp.frequency.linearRampToValueAtTime(900 + this.intensity * 1400, t + dur * 0.4);
        lp.Q.value = 1.2;
        o.connect(g).connect(lp).connect(bus);
        o.start(t);
        o.stop(t + dur + 0.2);
      }
    });

    // distant choir shimmer
    if (Math.random() < 0.75) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = freqs[3] * 2;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + 1);
      g.gain.linearRampToValueAtTime(0.05, t + dur * 0.5);
      g.gain.linearRampToValueAtTime(0.0001, t + dur);
      const trem = ctx.createOscillator();
      trem.frequency.value = 4.6;
      const tg = ctx.createGain();
      tg.gain.value = 0.018;
      trem.connect(tg).connect(g.gain);
      trem.start(t);
      trem.stop(t + dur);
      o.connect(g).connect(this.reverbSend);
      o.start(t + 1);
      o.stop(t + dur + 0.2);
    }
  }

  private playBossPulse() {
    const ctx = this.ctx!;
    const base = ctx.currentTime;
    for (let i = 0; i < 8; i++) {
      const t = base + i * 0.52;
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(72, t);
      o.frequency.exponentialRampToValueAtTime(38, t + 0.28);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.34, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
      o.connect(g).connect(this.musicBus);
      o.start(t);
      o.stop(t + 0.45);
    }
  }

  // ------------------------------- sfx -------------------------------------
  private env(node: AudioNode, t: number, a: number, d: number, peak: number) {
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    node.connect(g);
    return g;
  }

  swing(power = 1) {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(400, t);
    bp.frequency.exponentialRampToValueAtTime(2600 * power, t + 0.13);
    bp.frequency.exponentialRampToValueAtTime(500, t + 0.34);
    const g = this.env(bp, t, 0.03, 0.3, 0.3 * power);
    src.connect(bp);
    g.connect(this.sfxBus);
    g.connect(this.reverbSend);
    src.start(t);
    src.stop(t + 0.4);
  }

  hit(kind: "flesh" | "metal" | "crit" = "flesh") {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    // body thump
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(kind === "crit" ? 190 : 140, t);
    o.frequency.exponentialRampToValueAtTime(46, t + 0.16);
    const og = this.env(o, t, 0.004, 0.22, kind === "crit" ? 0.6 : 0.4);
    og.connect(this.sfxBus);
    o.start(t);
    o.stop(t + 0.3);

    // impact noise
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 1.4;
    const f = ctx.createBiquadFilter();
    f.type = kind === "metal" ? "bandpass" : "lowpass";
    f.frequency.value = kind === "metal" ? 3200 : 900;
    f.Q.value = kind === "metal" ? 6 : 1;
    const g = this.env(f, t, 0.003, kind === "metal" ? 0.5 : 0.16, kind === "metal" ? 0.4 : 0.32);
    src.connect(f);
    g.connect(this.sfxBus);
    g.connect(this.reverbSend);
    src.start(t);
    src.stop(t + 0.6);
  }

  parry() {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    [2400, 3600, 5200].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(f * 0.82, t + 0.5);
      const g = this.env(o, t, 0.002, 0.7 - i * 0.15, 0.16 / (i + 1));
      g.connect(this.sfxBus);
      g.connect(this.reverbSend);
      o.start(t);
      o.stop(t + 0.9);
    });
  }

  roll() {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.55;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(1400, t);
    f.frequency.exponentialRampToValueAtTime(220, t + 0.45);
    const g = this.env(f, t, 0.02, 0.42, 0.24);
    src.connect(f);
    g.connect(this.sfxBus);
    src.start(t);
    src.stop(t + 0.6);
  }

  step(heavy = false) {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 1.1 + Math.random() * 0.3;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = heavy ? 420 : 900;
    const g = this.env(f, t, 0.004, heavy ? 0.2 : 0.08, heavy ? 0.3 : 0.09);
    src.connect(f);
    g.connect(this.sfxBus);
    src.start(t);
    src.stop(t + 0.3);
    if (heavy) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(70, t);
      o.frequency.exponentialRampToValueAtTime(32, t + 0.25);
      const og = this.env(o, t, 0.005, 0.3, 0.4);
      og.connect(this.sfxBus);
      o.start(t);
      o.stop(t + 0.4);
    }
  }

  fire() {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.Q.value = 0.8;
    f.frequency.setValueAtTime(180, t);
    f.frequency.exponentialRampToValueAtTime(2200, t + 0.2);
    f.frequency.exponentialRampToValueAtTime(300, t + 0.8);
    const g = this.env(f, t, 0.05, 0.8, 0.32);
    src.connect(f);
    g.connect(this.sfxBus);
    g.connect(this.reverbSend);
    src.start(t);
    src.stop(t + 1);
  }

  explosion() {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.7;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(2600, t);
    f.frequency.exponentialRampToValueAtTime(140, t + 1.1);
    const g = this.env(f, t, 0.01, 1.2, 0.55);
    src.connect(f);
    g.connect(this.sfxBus);
    g.connect(this.reverbSend);
    src.start(t);
    src.stop(t + 1.5);
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(28, t + 0.7);
    const og = this.env(o, t, 0.005, 0.8, 0.6);
    og.connect(this.sfxBus);
    o.start(t);
    o.stop(t + 1);
  }

  roar() {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    for (let i = 0; i < 4; i++) {
      const o = ctx.createOscillator();
      o.type = i % 2 ? "sawtooth" : "square";
      const base = 62 * (1 + i * 0.34);
      o.frequency.setValueAtTime(base * 1.5, t);
      o.frequency.exponentialRampToValueAtTime(base * 0.62, t + 1.5);
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.setValueAtTime(1400, t);
      f.frequency.exponentialRampToValueAtTime(260, t + 1.8);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.2 / (i + 1), t + 0.18);
      g.gain.setValueAtTime(0.2 / (i + 1), t + 0.9);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.0);
      o.connect(f).connect(g);
      g.connect(this.sfxBus);
      g.connect(this.reverbSend);
      o.start(t);
      o.stop(t + 2.1);
    }
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const nf = ctx.createBiquadFilter();
    nf.type = "bandpass";
    nf.frequency.value = 700;
    nf.Q.value = 0.7;
    const ng = this.env(nf, t, 0.2, 1.7, 0.2);
    src.connect(nf);
    ng.connect(this.sfxBus);
    src.start(t);
    src.stop(t + 2.2);
  }

  heal() {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = f;
      const g = ctx.createGain();
      const st = t + i * 0.07;
      g.gain.setValueAtTime(0.0001, st);
      g.gain.linearRampToValueAtTime(0.11, st + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, st + 1.1);
      o.connect(g);
      g.connect(this.sfxBus);
      g.connect(this.reverbSend);
      o.start(st);
      o.stop(st + 1.2);
    });
  }

  ui(kind: "hover" | "click" = "click") {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = "triangle";
    o.frequency.setValueAtTime(kind === "click" ? 880 : 1320, t);
    o.frequency.exponentialRampToValueAtTime(kind === "click" ? 440 : 1180, t + 0.16);
    const g = this.env(o, t, 0.004, 0.2, kind === "click" ? 0.14 : 0.05);
    g.connect(this.sfxBus);
    g.connect(this.reverbSend);
    o.start(t);
    o.stop(t + 0.3);
  }

  grace() {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    [261.6, 392, 523.25, 659.25, 987.8].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = f;
      const g = ctx.createGain();
      const st = t + i * 0.14;
      g.gain.setValueAtTime(0.0001, st);
      g.gain.linearRampToValueAtTime(0.1, st + 0.3);
      g.gain.exponentialRampToValueAtTime(0.0001, st + 2.6);
      o.connect(g);
      g.connect(this.reverbSend);
      g.connect(this.sfxBus);
      o.start(st);
      o.stop(st + 2.8);
    });
  }

  heartbeat(intensity = 0.5) {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(55, t);
    o.frequency.exponentialRampToValueAtTime(32, t+0.35);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.18*intensity, t+0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t+0.6);
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 180;
    o.connect(f).connect(g);
    g.connect(this.sfxBus);
    o.start(t);
    o.stop(t+0.7);
  }

  death() {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    [58.27, 87.31, 116.54].forEach((f) => {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(f * 0.5, t + 4);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(700, t);
      lp.frequency.exponentialRampToValueAtTime(120, t + 4);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.16, t + 0.5);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 5);
      o.connect(lp).connect(g);
      g.connect(this.musicBus);
      g.connect(this.reverbSend);
      o.start(t);
      o.stop(t + 5.2);
    });
  }

  dispose() {
    if (this.musicTimer) {
      clearTimeout(this.musicTimer);
      this.musicTimer = undefined;
    }
    this.started = false; // prevent further scheduling in startMusic
    try {
      this.ctx?.close();
    } catch {}
    this.ctx = null;
  }
}

export const audio = new AudioEngine();
