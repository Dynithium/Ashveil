import * as THREE from "three";

// ---------------------------------------------------------------------------
// ASHVEIL — particle & effect systems
// ---------------------------------------------------------------------------

const P_VERT = /* glsl */ `
attribute float aSize;
attribute float aLife;
attribute vec3 aColor;
varying float vLife;
varying vec3 vColor;
void main(){
  vLife = aLife;
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * (300.0 / max(-mv.z, 0.1));
  gl_Position = projectionMatrix * mv;
}`;

const P_FRAG = /* glsl */ `
precision highp float;
varying float vLife;
varying vec3 vColor;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  float a = smoothstep(0.5, 0.06, d);
  a *= vLife;
  gl_FragColor = vec4(vColor * (0.7 + vLife * 1.4), a);
}`;

const SCRATCH_COLOR = new THREE.Color();

interface P {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number; max: number; size: number; grav: number; drag: number;
  r: number; g: number; b: number;
  fade: number;
}

export class Particles {
  points: THREE.Points;
  private pool: P[] = [];
  private cursor = 0;
  private positions: Float32Array;
  private sizes: Float32Array;
  private lifes: Float32Array;
  private colors: Float32Array;
  private geo: THREE.BufferGeometry;
  readonly capacity: number;

  constructor(capacity = 4000) {
    this.capacity = capacity;
    this.positions = new Float32Array(capacity * 3);
    this.sizes = new Float32Array(capacity);
    this.lifes = new Float32Array(capacity);
    this.colors = new Float32Array(capacity * 3);
    for (let i = 0; i < capacity; i++) {
      this.pool.push({ x: 0, y: -9999, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, size: 1, grav: 0, drag: 0, r: 1, g: 1, b: 1, fade: 1 });
      this.positions[i * 3 + 1] = -9999;
    }
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    this.geo.setAttribute("aSize", new THREE.BufferAttribute(this.sizes, 1));
    this.geo.setAttribute("aLife", new THREE.BufferAttribute(this.lifes, 1));
    this.geo.setAttribute("aColor", new THREE.BufferAttribute(this.colors, 3));
    const mat = new THREE.ShaderMaterial({
      vertexShader: P_VERT,
      fragmentShader: P_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    this.geo.setDrawRange(0, capacity);
  }

  emit(opts: {
    x: number; y: number; z: number;
    vx?: number; vy?: number; vz?: number;
    spread?: number; speed?: number;
    life?: number; size?: number; grav?: number; drag?: number;
    color?: THREE.Color | number; count?: number; colorJitter?: number;
    upBias?: number;
  }) {
    const n = opts.count ?? 1;
    const col = opts.color instanceof THREE.Color ? opts.color : SCRATCH_COLOR.set(opts.color ?? 0xffaa44);
    for (let i = 0; i < n; i++) {
      const p = this.pool[this.cursor];
      const idx = this.cursor;
      this.cursor = (this.cursor + 1) % this.capacity;
      const sp = opts.speed ?? 2;
      const spread = opts.spread ?? 1;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      const dirx = Math.sin(ph) * Math.cos(th);
      const diry = Math.cos(ph);
      const dirz = Math.sin(ph) * Math.sin(th);
      p.x = opts.x + dirx * 0.12 * spread;
      p.y = opts.y + diry * 0.12 * spread;
      p.z = opts.z + dirz * 0.12 * spread;
      const rs = sp * (0.35 + Math.random() * 0.9);
      p.vx = (opts.vx ?? 0) + dirx * rs * spread;
      p.vy = (opts.vy ?? 0) + diry * rs * spread + (opts.upBias ?? 0);
      p.vz = (opts.vz ?? 0) + dirz * rs * spread;
      p.max = (opts.life ?? 0.8) * (0.65 + Math.random() * 0.7);
      p.life = p.max;
      p.size = (opts.size ?? 6) * (0.6 + Math.random() * 0.9);
      p.grav = opts.grav ?? -6;
      p.drag = opts.drag ?? 1.4;
      const j = opts.colorJitter ?? 0.14;
      p.r = Math.max(0, col.r + (Math.random() - 0.5) * j);
      p.g = Math.max(0, col.g + (Math.random() - 0.5) * j);
      p.b = Math.max(0, col.b + (Math.random() - 0.5) * j);
      p.fade = 1;
      this.colors[idx * 3] = p.r;
      this.colors[idx * 3 + 1] = p.g;
      this.colors[idx * 3 + 2] = p.b;
      this.sizes[idx] = p.size;
    }
  }

  update(dt: number) {
    const pos = this.positions;
    const lifes = this.lifes;
    const sizes = this.sizes;
    let live = 0;
    for (let i = 0; i < this.capacity; i++) {
      const p = this.pool[i];
      if (p.life <= 0) {
        if (lifes[i] !== 0) {
          lifes[i] = 0;
          pos[i * 3 + 1] = -9999;
          live++;
        }
        continue;
      }
      live++;
      p.life -= dt;
      const d = Math.exp(-p.drag * dt);
      p.vx *= d;
      p.vz *= d;
      p.vy = (p.vy + p.grav * dt) * d;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      pos[i * 3] = p.x;
      pos[i * 3 + 1] = p.y;
      pos[i * 3 + 2] = p.z;
      const t = Math.max(0, p.life / p.max);
      lifes[i] = t * t;
      sizes[i] = p.size * (0.35 + t * 0.75);
    }
    // nothing alive → skip the GPU uploads entirely
    if (live === 0) return;
    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.aLife as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.aColor as THREE.BufferAttribute).needsUpdate = true;
  }
}

// --------------------------- weapon trail ----------------------------------
export class SwordTrail {
  mesh: THREE.Mesh;
  private segs: number;
  private pos: Float32Array;
  private alpha: Float32Array;
  private geo: THREE.BufferGeometry;
  private filled = 0;
  private strength = 0;

  constructor(segs = 22, color = 0xbfe4ff) {
    this.segs = segs;
    this.pos = new Float32Array(segs * 2 * 3);
    this.alpha = new Float32Array(segs * 2);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute("aAlpha", new THREE.BufferAttribute(this.alpha, 1));
    const idx: number[] = [];
    for (let i = 0; i < segs - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    this.geo.setIndex(idx);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) } },
      vertexShader: `
        attribute float aAlpha; varying float vA;
        void main(){ vA = aAlpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        precision highp float; varying float vA; uniform vec3 uColor;
        void main(){ if(vA<=0.001) discard; gl_FragColor = vec4(uColor * (0.6+vA*2.2), vA); }`,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
  }

  setColor(c: number) {
    ((this.mesh.material as THREE.ShaderMaterial).uniforms.uColor.value as THREE.Color).set(c);
  }

  push(base: THREE.Vector3, tip: THREE.Vector3, active: boolean) {
    const wasActive = this.strength > 0;
    this.strength = active ? 0.7 : Math.max(0, this.strength - 0.12);
    if (!active && !wasActive) return;

    if (active) {
      // slot 0 is always the newest sample — shift everything back one segment
      this.pos.copyWithin(6, 0, (this.segs - 1) * 6);
      this.pos[0] = base.x; this.pos[1] = base.y; this.pos[2] = base.z;
      this.pos[3] = tip.x; this.pos[4] = tip.y; this.pos[5] = tip.z;
      if (this.filled < this.segs) this.filled++;
      // keep the untouched tail pinned to the newest sample so no stray geometry appears
      for (let s = this.filled; s < this.segs; s++) {
        const i = s * 6;
        this.pos[i] = base.x; this.pos[i + 1] = base.y; this.pos[i + 2] = base.z;
        this.pos[i + 3] = tip.x; this.pos[i + 4] = tip.y; this.pos[i + 5] = tip.z;
      }
    }

    const denom = Math.max(1, this.filled - 1);
    for (let s = 0; s < this.segs; s++) {
      const a = s >= this.filled ? 0 : Math.max(0, 1 - s / denom);
      this.alpha[s * 2] = a * a * 0.5 * this.strength;
      this.alpha[s * 2 + 1] = a * a * this.strength;
    }
    if (!active && this.strength <= 0) this.filled = 0;
    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.aAlpha as THREE.BufferAttribute).needsUpdate = true;
  }

  clear() {
    if (this.filled === 0 && this.strength === 0) return;
    this.filled = 0;
    this.strength = 0;
    this.alpha.fill(0);
    (this.geo.attributes.aAlpha as THREE.BufferAttribute).needsUpdate = true;
  }
}

// ------------------------- shockwaves / decals -----------------------------
interface Wave {
  mesh: THREE.Mesh;
  life: number;
  max: number;
  grow: number;
  tilt: boolean;
}

export class Shockwaves {
  group = new THREE.Group();
  private items: Wave[] = [];
  private pool: THREE.Mesh[] = [];

  private acquire(color: number): THREE.Mesh {
    let m = this.pool.pop();
    if (!m) {
      const geo = new THREE.RingGeometry(0.7, 1, 64);
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      m = new THREE.Mesh(geo, mat);
    }
    (m.material as THREE.MeshBasicMaterial).color.set(color);
    this.group.add(m);
    return m;
  }

  spawn(pos: THREE.Vector3, color: number, size: number, life = 0.6, tilt = true) {
    const m = this.acquire(color);
    m.position.copy(pos);
    if (tilt) m.rotation.set(-Math.PI / 2, 0, Math.random() * 3);
    m.scale.setScalar(0.2);
    this.items.push({ mesh: m, life, max: life, grow: size, tilt });
  }

  update(dt: number, cam: THREE.Camera) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const w = this.items[i];
      w.life -= dt;
      const t = 1 - w.life / w.max;
      if (w.life <= 0) {
        this.group.remove(w.mesh);
        this.pool.push(w.mesh);
        this.items.splice(i, 1);
        continue;
      }
      const e = 1 - Math.pow(1 - t, 3);
      w.mesh.scale.setScalar(0.2 + e * w.grow);
      (w.mesh.material as THREE.MeshBasicMaterial).opacity = Math.pow(1 - t, 1.7) * 0.9;
      if (!w.tilt) w.mesh.quaternion.copy(cam.quaternion);
    }
  }
}

// ------------------------------ ambient ------------------------------------
export class AmbientEmbers {
  points: THREE.Points;
  private n: number;
  private data: Float32Array;
  private geo: THREE.BufferGeometry;

  constructor(n = 1400) {
    this.n = n;
    const positions = new Float32Array(n * 3);
    const sizes = new Float32Array(n);
    const lifes = new Float32Array(n);
    const colors = new Float32Array(n * 3);
    this.data = new Float32Array(n * 4); // vx, vy, vz, phase
    for (let i = 0; i < n; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 120;
      positions[i * 3 + 1] = Math.random() * 34;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 120;
      sizes[i] = 1.2 + Math.random() * 3.6;
      lifes[i] = 0.25 + Math.random() * 0.75;
      const warm = Math.random();
      colors[i * 3] = 1.0;
      colors[i * 3 + 1] = 0.62 + warm * 0.3;
      colors[i * 3 + 2] = 0.25 + warm * 0.35;
      this.data[i * 4] = (Math.random() - 0.5) * 0.5;
      this.data[i * 4 + 1] = 0.25 + Math.random() * 0.8;
      this.data[i * 4 + 2] = (Math.random() - 0.5) * 0.5;
      this.data[i * 4 + 3] = Math.random() * 6.28;
    }
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this.geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    this.geo.setAttribute("aLife", new THREE.BufferAttribute(lifes, 1));
    this.geo.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.ShaderMaterial({
      vertexShader: P_VERT,
      fragmentShader: P_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
  }

  update(dt: number, t: number, center: THREE.Vector3) {
    const pos = this.geo.attributes.position.array as Float32Array;
    const lifes = this.geo.attributes.aLife.array as Float32Array;
    for (let i = 0; i < this.n; i++) {
      const ph = this.data[i * 4 + 3];
      pos[i * 3] += (this.data[i * 4] + Math.sin(t * 0.7 + ph) * 0.5) * dt;
      pos[i * 3 + 1] += this.data[i * 4 + 1] * dt;
      pos[i * 3 + 2] += (this.data[i * 4 + 2] + Math.cos(t * 0.55 + ph * 1.3) * 0.5) * dt;
      lifes[i] = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * 1.6 + ph * 3));

      // recycle around the camera
      const dx = pos[i * 3] - center.x;
      const dz = pos[i * 3 + 2] - center.z;
      if (pos[i * 3 + 1] > center.y + 30 || Math.abs(dx) > 62 || Math.abs(dz) > 62) {
        pos[i * 3] = center.x + (Math.random() - 0.5) * 110;
        pos[i * 3 + 1] = center.y - 6 + Math.random() * 8;
        pos[i * 3 + 2] = center.z + (Math.random() - 0.5) * 110;
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aLife.needsUpdate = true;
  }
}
