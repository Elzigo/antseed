import assert from 'node:assert/strict';
import {test} from 'node:test';
import {DOT, centreX, centreY, fitGrid, grade, insideCard} from './meadow.ts';

test('the grid fills the card with the outer dots the same distance from every edge', () => {
  for (const [w, h] of [[1200, 440], [336, 368], [328, 392], [1264, 488]]) {
    const g = fitGrid(w, h);
    assert.ok(Math.abs(g.px - 15.5) < 0.5 && Math.abs(g.py - 15.5) < 0.5, `${w}x${h}: pitch ${g.px} × ${g.py}`);
    const left = centreX(g, 0) - DOT / 2;
    const right = w - (centreX(g, g.cols - 1) + DOT / 2);
    const top = centreY(g, 0) - DOT / 2;
    const bottom = h - (centreY(g, g.rows - 1) + DOT / 2);
    for (const m of [right, top, bottom]) assert.ok(Math.abs(m - left) < 0.6, `${w}x${h}: margins ${left} ${right} ${top} ${bottom}`);
  }
});

test('a dot the rounded corner would cut is left out', () => {
  const g = fitGrid(1200, 440);
  assert.equal(insideCard(g, 0, 0, 24), false);
  assert.equal(insideCard(g, 1, 1, 24), true);
  assert.equal(insideCard(g, 5, 0, 24), true);
});

/** One pixel per dot, all paper, with one leaf green at (1, 1) and one at the centre. */
function plate(cols: number, rows: number): Uint8ClampedArray {
  const px = new Uint8ClampedArray(cols * rows * 4).fill(246);
  const leaf = (i: number, j: number) => px.set([120, 150, 90, 255], (j * cols + i) * 4);
  leaf(1, 1);
  leaf(Math.floor(cols / 2), Math.floor(rows / 2));
  return px;
}

test('the paper drops out, the leaves stay, and the glow clears the dots behind the words', () => {
  const g = fitGrid(310, 155);
  const mid = Math.floor(g.rows / 2) * g.cols + Math.floor(g.cols / 2);
  const glow = {x: centreX(g, Math.floor(g.cols / 2)), y: centreY(g, Math.floor(g.rows / 2)), rx: 60, ry: 30, strength: 0.9, soft: 0.65};
  for (const night of [false, true]) {
    const t = grade(plate(g.cols, g.rows), g, glow, night, 0);
    assert.equal(t.alpha[3 * g.cols + 5], 0, 'paper');
    assert.ok(t.alpha[g.cols + 1] > 0.9, 'a leaf outside the glow');
    assert.ok(t.alpha[mid] < 0.15, 'a leaf behind the words');
    if (night) assert.ok(t.lit[g.cols + 1] > 0.5, 'a green leaf lights up at night');
  }
});
