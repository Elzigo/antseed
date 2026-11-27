// A word longer than this (in characters) may not fit a phone's column (288px at 320, about 32 mono characters at the
// chip's size), so it is left free to wrap inside instead of being kept whole.
export const KEEP_WHOLE_MAX = 32;

export type Piece = {text: string; whole: boolean};

// Splits an inline code chip into its words and the spaces between them: a short word is kept whole, a space is where the
// chip may break.
export function words(text: string): Piece[] {
  return text
    .split(/(\s+)/)
    .filter(Boolean)
    .map((part) => ({text: part, whole: !/^\s/.test(part) && part.length <= KEEP_WHOLE_MAX}));
}
