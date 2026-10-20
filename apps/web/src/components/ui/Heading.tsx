// Heading levels that follow the page outline: a page's sections sit under its
// <h1> (level 2 at the top), and every titled Panel, form section or dialog
// moves the headings inside it one level down. Components that render a title
// use <Heading> instead of a fixed h2 / h3 / h4, so the same Panel reads as an
// h2 on a page and an h3 inside another panel (no skipped levels: WCAG 1.3.1,
// axe "heading-order").

import { createContext, useContext, type HTMLAttributes, type ReactNode } from 'react';

export type HeadingLevel = 2 | 3 | 4 | 5 | 6;

const LevelContext = createContext<HeadingLevel>(2);

/** Level a <Heading> renders at in this part of the tree. */
export function useHeadingLevel(): HeadingLevel {
  return useContext(LevelContext);
}

/** Content under a heading: headings inside it render one level deeper (or at `level`). */
export function HeadingScope({ level, children }: { level?: HeadingLevel; children: ReactNode }) {
  const current = useContext(LevelContext);
  return <LevelContext.Provider value={level ?? (Math.min(6, current + 1) as HeadingLevel)}>{children}</LevelContext.Provider>;
}

/** A heading at the level of where it sits (see HeadingScope); styling stays with the caller. */
export function Heading(props: HTMLAttributes<HTMLHeadingElement>) {
  const Tag = `h${useContext(LevelContext)}` as const;
  return <Tag {...props} />;
}
