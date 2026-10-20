import { useEffect, useRef, useState } from 'react';

export interface PauseStatusProps {
  paused: boolean;
  /** What pauses, e.g. "Feed" or "New column". */
  what: string;
}

/**
 * Screen-reader note when a live list pauses or resumes. Only the state
 * change is announced: the "N new" counts next to it update with every
 * incoming batch and stay out of live regions, which would read them out
 * each time.
 */
export function PauseStatus({ paused, what }: PauseStatusProps) {
  const [text, setText] = useState('');
  const last = useRef(paused);
  useEffect(() => {
    if (last.current === paused) return;
    last.current = paused;
    setText(`${what} ${paused ? 'paused' : 'resumed'}`);
  }, [paused, what]);
  return (
    <span role="status" className="sr-only">
      {text}
    </span>
  );
}
