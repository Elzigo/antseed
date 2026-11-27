import {test} from 'node:test';
import assert from 'node:assert/strict';
import {KEEP_WHOLE_MAX, words} from './words.ts';

test('a chip keeps each word whole and breaks only at its spaces', () => {
  assert.deepEqual(words('antseed --no-buyer'), [
    {text: 'antseed', whole: true},
    {text: ' ', whole: false},
    {text: '--no-buyer', whole: true},
  ]);
});

test('a word too long for a phone column is left free to wrap', () => {
  const long = 'x'.repeat(KEEP_WHOLE_MAX + 1);
  assert.deepEqual(words(long), [{text: long, whole: false}]);
});

test('the words put back together give the chip unchanged', () => {
  const chip = ' <data-dir>/verifier  --epoch <n> ';
  assert.equal(words(chip).map((p) => p.text).join(''), chip);
});
