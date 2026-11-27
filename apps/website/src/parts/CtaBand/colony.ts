/* What moves over the meadow mosaic, from the Meadow hero: ants (small dots inside the big ones) walking the grid a cell at a time,
   tinting the dots they cross for a moment. A mouse over the card: the nearby ants line up in single file behind it and follow the path
   it took. A click or a tap on the card: a ring goes out from there across the dots and every ant comes to it, mills about, then
   wanders again. With no mouse (a touch screen), now and then one ant leads a few others in a short file of their own. The ants fade
   out in the glow behind the words. */
import {DOT, centreX, centreY, smooth, type Grid, type Rgb} from './meadow.ts';

const ANT = 7.5;
/** One ant per this many cells. */
const ANT_PER = 70;
const MAX_QUEUE = 28;
/** A touch screen's short files: how many follow the leader, how long a file lasts, and the pause between two (ms). */
const FILE_MIN = 3;
const FILE_MAX = 5;
const FILE_TIME = [5000, 7500] as const;
const FILE_PAUSE = [2500, 6000] as const;
/** How long called ants stay round the call (ms). */
const CALLED_TIME = [4000, 5500] as const;
const TRAIL = 0.3;
/** Seconds for a trail to fade by half. */
const TRAIL_HALF = 0.38;
/** The ring after a click: cells a second, ms. On a small card (a phone) it runs slower, so it is seen crossing the card. */
const RING_SPEED = 40;
const RING_MIN_SPEED = 16;
const RING_CROSSING = 1.1;
const RING_LIFE = 1500;
const RING_INKS: Rgb[] = [[0xc8, 0xf5, 0x3c], [0xf6, 0xc4, 0x45], [0xe8, 0x74, 0x2c]];
/** 60 frames a second within this long of the last input, 30 at rest. */
const BUSY_MS = 2000;
const DIRS: readonly [number, number][] = [[1, 0], [0, 1], [-1, 0], [0, -1]];

export type Look = {ant: string; trail: Rgb; glow: boolean};
export const DAY: Look = {ant: '#546818', trail: [0x0a, 0x1a, 0x12], glow: false};
export const NIGHT: Look = {ant: '#a6e05a', trail: [0x98, 0xc4, 0x63], glow: true};

type State = 'wander' | 'line' | 'lead' | 'called';
export type Ant = {i: number; j: number; pi: number; pj: number; t: number; dur: number; dir: number; sense: number; state: State;
  goal: [number, number] | null; until: number};
type Ring = {i: number; j: number; start: number};

const between = ([a, b]: readonly [number, number]) => a + Math.random() * (b - a);
const rand = (n: number) => Math.floor(Math.random() * n);

export class Colony {
  ants: Ant[] = [];
  /** Grid cells, path[0] the head (the pointer's cell or the leader's), then where it has been. */
  path: [number, number][] = [];
  queue: Ant[] = [];
  /** A touch screen: short files of their own, as there is no pointer to follow. */
  auto = false;
  private g: Grid = {cols: 0, rows: 0, px: 1, py: 1};
  private veil: Float32Array = new Float32Array(0);
  private on: Uint8Array = new Uint8Array(0);
  private trail: Float32Array = new Float32Array(0);
  private rings: Ring[] = [];
  private pointer: {x: number; y: number; sx: number; sy: number} | null = null;
  private leader: Ant | null = null;
  private fileSize = 0;
  private fileUntil = 0;
  private nextFile = 0;
  private last = 0;
  private lastInput = -Infinity;
  private sprite: HTMLCanvasElement | null = null;

  /** A new grid starts the ants afresh; the same grid (a new glow or theme) keeps them walking. */
  reset(g: Grid, veil: Float32Array, on: Uint8Array): void {
    const same = g.cols === this.g.cols && g.rows === this.g.rows;
    this.g = g; this.veil = veil; this.on = on;
    if (same && this.ants.length) return;
    this.trail = new Float32Array(g.cols * g.rows);
    this.path = []; this.queue = []; this.rings = []; this.leader = null;
    const cells: number[] = [];
    on.forEach((v, q) => { if (v) cells.push(q); });
    const n = cells.length ? Math.max(1, Math.round((g.cols * g.rows) / ANT_PER)) : 0;
    this.ants = Array.from({length: n}, () => {
      const q = cells[rand(cells.length)];
      const i = q % g.cols;
      const j = Math.floor(q / g.cols);
      return {i, j, pi: i, pj: j, t: 1, dur: 120, dir: rand(4), sense: 10 + Math.random() * 26, state: 'wander', goal: null, until: 0};
    });
  }

  /** The mouse over the card, in card px; null when it leaves. */
  setPointer(p: {x: number; y: number} | null, now: number): void {
    if (!p) { this.pointer = null; this.release(); return; }
    this.lastInput = now;
    if (!this.pointer) { this.endFile(now); this.path = []; this.pointer = {...p, sx: p.x, sy: p.y}; }
    else Object.assign(this.pointer, p);
  }

  /** A click or tap at (x, y): the ring goes out from there, and every ant comes to the nearest cell they show on. */
  call(x: number, y: number, now: number): void {
    this.lastInput = now;
    const [i, j] = this.cellOf(x, y);
    this.rings.push({i, j, start: now});
    const goal = this.visibleNear(i, j);
    this.endFile(now);
    this.queue = [];
    for (const a of this.ants) { a.state = 'called'; a.goal = goal; a.until = now + between(CALLED_TIME); }
  }

  /** Steps the ants on; returns false when called sooner than the frame budget. */
  tick(now: number): boolean {
    if (!this.ants.length) return false;
    const budget = now - this.lastInput < BUSY_MS ? 1000 / 60 : 1000 / 30;
    if (now - this.last < budget - 2) return false;
    const dt = Math.min(64, now - this.last);
    this.last = now;
    const p = this.pointer;
    if (p) {
      p.sx += (p.x - p.sx) * 0.3; p.sy += (p.y - p.sy) * 0.3;
      this.track(this.cellOf(p.sx, p.sy));
    } else if (this.auto) this.files(now);
    for (const a of this.ants) { a.t += dt / a.dur; if (a.t >= 1) this.step(a, now); }
    const decay = 0.5 ** (dt / (TRAIL_HALF * 1000));
    for (let k = 0; k < this.trail.length; k++) this.trail[k] *= decay;
    this.rings = this.rings.filter((r) => now - r.start < RING_LIFE);
    return true;
  }

  /** The moving layer over the mosaic at rest: the trails, the ring, the ants. */
  draw(ctx: CanvasRenderingContext2D, now: number, look: Look): void {
    const {g} = this;
    ctx.clearRect(0, 0, g.cols * g.px, g.rows * g.py);
    const paint = (q: number, [r, gr, b]: Rgb, a: number) => {
      ctx.globalAlpha = Math.min(1, a);
      ctx.fillStyle = `rgb(${r},${gr},${b})`;
      ctx.beginPath(); ctx.arc(centreX(g, q % g.cols), centreY(g, Math.floor(q / g.cols)), DOT / 2, 0, Math.PI * 2); ctx.fill();
    };
    for (let q = 0; q < this.trail.length; q++) {
      if (!this.on[q]) continue;
      const tr = this.trail[q] * TRAIL * this.veil[q];
      if (tr > 0.03) paint(q, look.trail, tr);
    }
    for (const r of this.rings) {
      const age = now - r.start;
      const speed = Math.max(RING_MIN_SPEED, Math.min(RING_SPEED, Math.hypot(g.cols, g.rows) / RING_CROSSING));
      const radius = (age / 1000) * speed;
      const fade = (1 - age / RING_LIFE) * 0.85;
      for (let q = 0; q < this.on.length; q++) {
        if (!this.on[q]) continue;
        const i = q % g.cols;
        const j = Math.floor(q / g.cols);
        const band = Math.abs(Math.hypot(i - r.i, j - r.j) - radius);
        if (band < 1.5) paint(q, RING_INKS[Math.min(2, Math.floor(band))], fade * (0.2 + 0.8 * this.clear(i, j)));   // faint behind the words
      }
    }
    const sprite = look.glow ? this.spriteFor(look.ant, ctx) : null;
    const half = sprite ? sprite.width / 2 / devicePixelScale(ctx) : 0;
    ctx.fillStyle = look.ant;
    for (const a of this.ants) {
      const e = a.t < 1 ? a.t * a.t * (3 - 2 * a.t) : 1;
      const from = this.clear(a.pi, a.pj);
      const alpha = from + (this.clear(a.i, a.j) - from) * e;
      if (alpha < 0.02) continue;
      ctx.globalAlpha = alpha;
      const x = centreX(g, a.pi + (a.i - a.pi) * e);
      const y = centreY(g, a.pj + (a.j - a.pj) * e);
      if (sprite) ctx.drawImage(sprite, x - half, y - half, half * 2, half * 2);
      else { ctx.beginPath(); ctx.arc(x, y, ANT / 2, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
  }

  /** 0 in the glow behind the words, 1 outside it. */
  private clear(i: number, j: number): number { return smooth(0.2, 0.85, this.veil[j * this.g.cols + i] ?? 1); }

  private cellOf(x: number, y: number): [number, number] {
    const {g} = this;
    return [Math.max(0, Math.min(g.cols - 1, Math.floor(x / g.px))), Math.max(0, Math.min(g.rows - 1, Math.floor(y / g.py)))];
  }

  /** The cell nearest (i, j) where an ant shows (clear of the words), so a call near the words gathers the ants beside them. */
  private visibleNear(i: number, j: number): [number, number] {
    if (this.on[j * this.g.cols + i] && this.clear(i, j) >= 0.6) return [i, j];
    let best: [number, number] = [i, j];
    let bestD = Infinity;
    for (let q = 0; q < this.on.length; q++) {
      const ci = q % this.g.cols;
      const cj = Math.floor(q / this.g.cols);
      if (!this.on[q] || this.clear(ci, cj) < 0.6) continue;
      const d = Math.hypot(ci - i, cj - j);
      if (d < bestD) { bestD = d; best = [ci, cj]; }
    }
    return best;
  }

  /** Walks the path from its head to the new cell in grid steps, so the line can follow it exactly. */
  private track([ci, cj]: [number, number]): void {
    if (!this.path.length) { this.path.push([ci, cj]); return; }
    let [i, j] = this.path[0];
    while (i !== ci || j !== cj) {
      if (Math.abs(ci - i) >= Math.abs(cj - j)) i += Math.sign(ci - i); else j += Math.sign(cj - j);
      this.path.unshift([i, j]);
    }
    this.path.length = Math.min(this.path.length, MAX_QUEUE + 8);
  }

  private slot(k: number): [number, number] { return this.path[Math.min(k + 1, this.path.length - 1)]; }

  private release(): void {
    for (const a of this.queue) a.state = 'wander';
    this.queue = []; this.path = [];
  }

  /** A touch screen: a file starts now and then, led by a wandering ant clear of the words, and breaks up after a few seconds. */
  private files(now: number): void {
    if (this.leader && now > this.fileUntil) this.endFile(now);
    if (this.leader || now < this.nextFile) return;
    const free = this.ants.filter((a) => a.state === 'wander' && this.clear(a.i, a.j) > 0.6);
    if (!free.length) { this.nextFile = now + 1000; return; }
    const lead = free[rand(free.length)];
    lead.state = 'lead';
    this.leader = lead;
    this.path = [[lead.i, lead.j]];
    this.fileSize = FILE_MIN + rand(FILE_MAX - FILE_MIN + 1);
    this.fileUntil = now + between(FILE_TIME);
  }

  private endFile(now: number): void {
    if (!this.leader) return;
    this.leader.state = 'wander';
    this.leader = null;
    this.release();
    this.nextFile = now + between(FILE_PAUSE);
  }

  private toward(a: Ant, [gi, gj]: [number, number]): number {
    const dx = gi - a.i;
    const dy = gj - a.j;
    if (!dx && !dy) return -1;
    return Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 0 : 2) : (dy > 0 ? 1 : 3);
  }

  private open(i: number, j: number): boolean { return i >= 0 && j >= 0 && i < this.g.cols && j < this.g.rows && !!this.on[j * this.g.cols + i]; }

  private step(a: Ant, now: number): void {
    const k = a.j * this.g.cols + a.i;
    this.trail[k] = Math.min(1, this.trail[k] + (a.state === 'line' ? 0.25 : 0.5));
    a.pi = a.i; a.pj = a.j; a.t = 0;
    let d = -1;
    if (a.state === 'line') {
      d = this.toward(a, this.slot(this.queue.indexOf(a)));
      a.dur = 55;
    } else if (a.state === 'lead') {
      // mostly straight on, turning away from the words and the edges
      const ahead = Math.random() < 0.75 ? a.dir : (a.dir + (Math.random() < 0.5 ? 1 : 3)) % 4;
      d = [0, 1, 3, 2].map((turn) => (ahead + turn) % 4)
        .find((c) => this.open(a.i + DIRS[c][0], a.j + DIRS[c][1]) && this.clear(a.i + DIRS[c][0], a.j + DIRS[c][1]) > 0.5) ?? ahead;
      a.dur = 170 + Math.random() * 60;
    } else if (a.state === 'called' && a.goal && now < a.until) {
      const far = Math.abs(a.goal[0] - a.i) + Math.abs(a.goal[1] - a.j) > 1;
      d = far && Math.random() < 0.85 ? this.toward(a, a.goal) : rand(4);
      a.dur = far ? 70 + Math.random() * 30 : 160 + Math.random() * 80;
    } else {
      if (a.state === 'called') { a.state = 'wander'; a.goal = null; }
      // wander, or head for the end of the line when it is near
      const room = this.pointer ? MAX_QUEUE : this.leader ? this.fileSize : 0;
      const tail = this.path.length && this.queue.length < room ? this.slot(this.queue.length) : null;
      const dist = tail ? Math.abs(tail[0] - a.i) + Math.abs(tail[1] - a.j) : Infinity;
      if (tail && dist <= a.sense) {
        if (dist <= 1) { a.state = 'line'; this.queue.push(a); a.dur = 55; return; }
        d = Math.random() < 0.8 ? this.toward(a, tail) : rand(4);
        a.dur = 65 + Math.random() * 30;
      } else {
        d = Math.random() < 0.7 ? a.dir : (a.dir + (Math.random() < 0.5 ? 1 : 3)) % 4;
        a.dur = 120 + Math.random() * 80;
      }
    }
    if (d < 0) return;
    let ni = a.i + DIRS[d][0];
    let nj = a.j + DIRS[d][1];
    if (!this.open(ni, nj)) { d = (d + 2) % 4; ni = a.i + DIRS[d][0]; nj = a.j + DIRS[d][1]; }
    if (!this.open(ni, nj)) return;
    a.dir = d; a.i = ni; a.j = nj;
    if (a === this.leader) this.track([ni, nj]);
  }

  /** Night: the ant's dot with its glow, drawn once and then laid down whole. */
  private spriteFor(ink: string, ctx: CanvasRenderingContext2D): HTMLCanvasElement {
    const scale = devicePixelScale(ctx);
    const key = `${ink}@${scale}`;
    if (this.sprite?.dataset.key === key) return this.sprite;
    const blur = ANT * 0.9;
    const m = Math.ceil(ANT / 2 + blur * 1.5);
    const c = document.createElement('canvas');
    c.width = c.height = Math.ceil(m * 2 * scale);
    c.dataset.key = key;
    const s = c.getContext('2d');
    if (s) {
      s.scale(scale, scale);
      s.fillStyle = s.shadowColor = ink;
      const dot = () => { s.beginPath(); s.arc(m, m, ANT / 2, 0, Math.PI * 2); s.fill(); };
      s.shadowBlur = blur * scale; dot(); s.shadowBlur = 0; dot();
    }
    this.sprite = c;
    return c;
  }
}

/** The canvas's device pixels per CSS pixel (its transform's scale). */
const devicePixelScale = (ctx: CanvasRenderingContext2D): number => ctx.getTransform().a || 1;
