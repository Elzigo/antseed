import type {ReactNode} from 'react';
import type {Props} from '@theme/CodeInline';
import {words} from './words';
import styles from './styles.module.css';

// An inline code chip breaks only at its spaces, so `--no-buyer` never splits at a hyphen, while the chip itself stays
// inline: a bracket or full stop written against it stays on its line (an inline-block chip left them alone at a line's
// end). Copying the chip gives the same text.
export default function CodeInline({children, ...props}: Props): ReactNode {
  const text = typeof children === 'string' ? children : Array.isArray(children) && children.every((c) => typeof c === 'string') ? children.join('') : null;
  if (text === null) return <code {...props}>{children}</code>;
  return (
    <code {...props}>
      {words(text).map((piece, i) => (piece.whole ? <span key={i} className={styles.whole}>{piece.text}</span> : piece.text))}
    </code>
  );
}
