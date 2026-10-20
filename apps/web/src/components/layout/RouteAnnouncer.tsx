import { useEffect, useRef, useState } from 'react';
import { APP_NAME } from './Page';

const SUFFIX = ` · ${APP_NAME}`;

/**
 * Announces the new page (its document title) after client-side navigation,
 * so screen-reader users know the view changed while focus stays on the link
 * they used. Lazy pages set their title once their chunk renders: the first
 * title change after a navigation is announced, or the current title after
 * a second when it did not change.
 */
export function RouteAnnouncer({ pathname }: { pathname: string }) {
  const [text, setText] = useState('');
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false; // the initial load is announced by the browser
      return;
    }
    let done = false;
    const announce = () => {
      if (done) return;
      done = true;
      const next = document.title.endsWith(SUFFIX) ? document.title.slice(0, -SUFFIX.length) : document.title;
      // Same text twice is not re-read: vary it invisibly.
      setText((prev) => (prev === next ? `${next} ` : next));
    };
    const titleEl = document.querySelector('title');
    const observer = titleEl ? new MutationObserver(announce) : null;
    if (titleEl) observer?.observe(titleEl, { childList: true, characterData: true, subtree: true });
    const timer = setTimeout(announce, 1000);
    return () => {
      observer?.disconnect();
      clearTimeout(timer);
    };
  }, [pathname]);
  return (
    <p role="status" className="sr-only">
      {text}
    </p>
  );
}
