/* The closing band's mosaic, from the Meadow hero (texture-lab/hero): a watercolour meadow with flat paper in the middle, sampled one
   colour per dot. Each dot's opacity rises with its ink (colour, or darkness against the paper), so the paper drops out and the leaves
   and daisies stay; a soft ellipse round the words clears the dots behind them. At night the dots are unlit grey, and the coloured ones
   light up like LEDs, the greens pulled toward lime. */

/** The hero's grid: 13px dots on a 15.5px pitch, stretched a little per axis so the outer dots sit evenly from every edge. */
export const PITCH = 15.5;
export const DOT = 13;

const SATURATION = 1.1;
const CONTRAST = 1.08;
/** Below `LOW` ink a dot is gone; from there its opacity rises to full at `HIGH`. */
const LOW = 0.07;
const HIGH = 0.24;
/** Below this opacity a dot is not drawn at rest. */
const SHOWN = 0.03;
/** Night: the unlit dot, and how much colour a dot needs to light up (from, to). */
const DARK_DOT: Rgb = [0x2b, 0x31, 0x2e];
const LIT_FROM = 0.07;
const LIT_TO = 0.2;
const LIT_SAT = 1.6;
const LIT_LIGHT = 0.62;

export type Rgb = [number, number, number];
export type Grid = {cols: number; rows: number; px: number; py: number};
/** The glow behind the words: centre and radii in px, how much it clears (0 to 1) and how soft its edge is. */
export type Glow = {x: number; y: number; rx: number; ry: number; strength: number; soft: number};
/** Per dot: its colour, its opacity at rest, its lit share at night (what glows), and the glow's veil (0 behind the words, 1 outside). */
export type Tiles = {rgb: Float32Array; alpha: Float32Array; lit: Float32Array; veil: Float32Array; on: Uint8Array};

export const smooth = (a: number, b: number, v: number): number => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function fitGrid(width: number, height: number): Grid {
  const cols = Math.max(1, Math.round(width / PITCH));
  const rows = Math.max(1, Math.round(height / PITCH));
  return {cols, rows, px: width / cols, py: height / rows};
}

export const centreX = (g: Grid, i: number): number => (i + 0.5) * g.px;
export const centreY = (g: Grid, j: number): number => (j + 0.5) * g.py;

/** The whole dot is inside the card's rounded corners (a dot the corner would cut is left out, as on a display). */
export function insideCard(g: Grid, i: number, j: number, radius: number): boolean {
  const w = g.cols * g.px;
  const h = g.rows * g.py;
  const x = centreX(g, i);
  const y = centreY(g, j);
  if ((x >= radius && x <= w - radius) || (y >= radius && y <= h - radius)) return true;   // not in a corner
  const ax = Math.min(Math.max(x, radius), w - radius);
  const ay = Math.min(Math.max(y, radius), h - radius);
  return Math.hypot(x - ax, y - ay) + DOT / 2 <= radius + 0.5;
}

/** Night: a dot's lit colour from its own, its hue kept, the olives and greens pulled toward lime (78°), more saturated. */
function lit([r, g, b]: Rgb): Rgb {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const d = (mx - mn) / 255;
  const l = (mx + mn) / 510;
  let h = !d ? 0 : mx === r ? ((g - b) / 255 / d + 6) % 6 : mx === g ? (b - r) / 255 / d + 2 : (r - g) / 255 / d + 4;
  h *= 60;
  if (h > 38 && h < 170) h = 78 + (h - 78) * 0.3;
  const s = Math.min(1, (d ? d / (1 - Math.abs(2 * l - 1)) : 0) * LIT_SAT + 0.3);
  const L = Math.min(0.8, Math.max(0.4, LIT_LIGHT + (h < 55 ? -0.06 : 0.04) + (l - 0.55) * 0.4));   // the oranges deeper, the limes paler
  const c = (1 - Math.abs(2 * L - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const o = L - c / 2;
  const [r1, g1, b1] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r1 + o) * 255, (g1 + o) * 255, (b1 + o) * 255];
}

/** Grades the watercolour, sampled one RGBA pixel per dot (`pixels`, cols × rows), into the dots. A dot is a colour laid over the
 *  card at an opacity, so the mosaic sits on the card's own background in both themes. */
export function grade(pixels: Uint8ClampedArray, g: Grid, glow: Glow | null, night: boolean, radius: number): Tiles {
  const n = g.cols * g.rows;
  const t: Tiles = {rgb: new Float32Array(n * 3), alpha: new Float32Array(n), lit: new Float32Array(n), veil: new Float32Array(n), on: new Uint8Array(n)};
  for (let j = 0; j < g.rows; j++) for (let i = 0; i < g.cols; i++) {
    const q = j * g.cols + i;
    const p = q * 4;
    if (!insideCard(g, i, j, radius)) continue;
    t.on[q] = 1;
    const lum0 = (pixels[p] + pixels[p + 1] + pixels[p + 2]) / 3;
    const rgb = [pixels[p], pixels[p + 1], pixels[p + 2]].map((v) => Math.max(0, Math.min(255, 128 + (lum0 + (v - lum0) * SATURATION - 128) * CONTRAST))) as Rgb;
    const lum = (rgb[0] + rgb[1] + rgb[2]) / 3;
    const chroma = (Math.max(...rgb) - Math.min(...rgb)) / 255;
    const ink = Math.max(chroma, ((236 - lum) / 255) * 1.4);
    const e = glow ? Math.hypot((centreX(g, i) - glow.x) / glow.rx, (centreY(g, j) - glow.y) / glow.ry) : Infinity;
    const veil = glow ? 1 - glow.strength * (1 - smooth(1 - glow.soft, 1 + glow.soft, e)) : 1;
    t.veil[q] = veil;
    const a = smooth(LOW, HIGH, ink) * veil;
    if (a <= SHOWN) continue;
    let colour = rgb;
    let alpha = a;
    if (night) {
      // the unlit grey and the lit colour, each as far as the dot's colour goes (the pale unlit ones a little stronger)
      const share = smooth(LIT_FROM, LIT_TO, chroma);
      const unlit = (1 - share) * a ** 0.6;
      const on = share * a;
      const L = lit(rgb);
      alpha = Math.min(1, unlit + on);
      colour = [0, 1, 2].map((c) => (DARK_DOT[c] * unlit + L[c] * on) / (unlit + on)) as Rgb;
      t.lit[q] = on;
    }
    t.rgb.set(colour, q * 3);
    t.alpha[q] = alpha;
  }
  return t;
}
