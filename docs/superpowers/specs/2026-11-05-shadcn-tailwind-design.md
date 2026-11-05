# UI on shadcn + Tailwind

## Why

The UI is hand-made: `src/styles.css` (≈3 600 lines, ≈500 class rules), a home-drawn icon set
(`src/app/icons.tsx`) and home-made menus, pickers and combos. Every interactive element
re-implements keyboard, focus, scrolling and positioning, and bugs follow (the list that
lost its row under a still mouse). The owner wants the stack of `../pragma-once`: shadcn on
Base UI, Tailwind, Lucide icons. Themes come almost free with it.

## What the user gets

- The same app, same look (flat, white, warm neutrals, system font, Conductor density), with
  Lucide icons instead of the hand-drawn ones.
- Menus, pickers, combos, context menus, tooltips that behave like solid native controls:
  keyboard, focus, scrolling and placement handled by Base UI.
- Themes become cheap later: everything reads the same tokens. Light only for now.

## Stack (owner's decision, copied from pragma-once)

- Tailwind v4 via `@tailwindcss/vite`, `tw-animate-css`.
- shadcn, style `base-nova` (Base UI primitives, `@base-ui/react`), `components.json` with
  `cssVariables: true`, `iconLibrary: "lucide"`, components in `src/components/ui/`,
  `cn()` in `src/lib/utils.ts` (`clsx` + `tailwind-merge`), `class-variance-authority`.
- `lucide-react` for every icon; `src/app/icons.tsx` goes.
- Read pragma-once's `packages/ui` (components.json, `src/styles/globals.css`,
  `src/components/*`, `src/lib/*`) and follow its conventions.

## Goals

- Every component styled with Tailwind utilities and shadcn components; `src/styles.css`
  reduced to the theme (tokens) and the few global rules Tailwind cannot express (scrollbars,
  xterm, markdown body).
- The current colours become shadcn variables (`--background`, `--foreground`, `--muted`,
  `--muted-foreground`, `--border`, `--accent`, `--popover`, `--ring`, `--sidebar*`…) plus the
  app's own (`--good`, `--warn`, `--critical`, `--bar`…) registered in `@theme` so utilities
  use them. Light only: no dark set yet (owner's call).
- Visual parity in light mode with today, screen by screen.

## Non-goals

- New features or layout changes. Dark mode and a theme picker (later; the tokens allow it).
- The terminal's colours beyond following the theme's background/foreground.

## Anti-goals

- shadcn's default look leaking in (rounded-lg cards, shadows, blue rings): restyle the
  primitives to the app's tokens and density.
- A browser feel: no text selection outside inputs and messages, no web focus rings on click,
  no hover delays on tooltips that feel web-like.
- Breaking a keyboard shortcut or the "no modal for anything quick" rule. The composer stays
  the one dialog.

## How

- **Browser preview first.** A dev-only mock of Tauri IPC (`@tauri-apps/api/mocks`
  `mockIPC`, loaded only when not inside Tauri and only in `vite` dev) with fixture data:
  a few projects and workspaces, chats with every block kind (text, thinking, tools, a
  permission, command chip and output card), terminals (static), git changes and a PR,
  quotas. Lets anyone run `bun run web:dev` and screenshot every screen. Baseline screenshots
  of every screen are taken before any styling change and kept out of the repo
  (scratch folder).
- **Order:** setup and tokens (no visual change) → shadcn primitives restyled → screens
  migrated in parallel by file ownership → `styles.css` cleanup.
- Each screen migration ends with a side-by-side screenshot check against the baseline.

## Left to the builder

- Which shadcn components to add (at least: button, input, textarea, tooltip, menu,
  context-menu, popover, combobox/command, dialog, separator, scroll-area if it helps).
- Exact Tailwind class choices; keeping a few semantic class names where they help tests or
  the xterm/markdown globals.

## Checks

- Existing tests, lint, tsc, cargo test stay green.
- Screenshot parity per screen.
- Owner's manual pass in `bun run dev`.
