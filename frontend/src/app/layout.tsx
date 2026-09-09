import type { ReactNode } from 'react';

/**
 * Every route lives under `/[locale]`, and that layout owns `<html>`/`<body>` so it can
 * set `lang` from the resolved locale. Next still requires a root layout, so this one
 * only passes children through.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
