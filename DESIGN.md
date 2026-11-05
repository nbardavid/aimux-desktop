# aimux desktop — design

The bar: a product, not a tool. Everything on screen is deliberate, aligned and finished;
everything that moves, moves smoothly and for a reason. If a detail looks "good enough", it
isn't. Reference for layout, density and feel: Conductor.build. For craft: Linear, Things.

## Principles

- **Calm.** White surfaces, warm neutrals, hairlines. Colour only says what needs attention
  (working, waiting, failing, done). No decoration, no gradients for show, no hatching.
- **Dense, not cramped.** Compact rows (26–32px), 13px text, generous outer margins. Show
  everything that matters without scrolling or hovering for it.
- **Square and aligned.** Every edge lines up with something: bar heights (40px), panel
  paddings, list insets, icon centres. Small radii (4–7px; 10–12px only for floating
  surfaces). A misaligned pixel is a bug.
- **Native.** System font, macOS shortcuts, no browser feel: no text selection outside text,
  no focus ring on click, no web-style hover delays, no page-like scroll jumps.
- **Keyboard first.** Every action reachable from the keyboard; the focused item is always
  visible and in view.

## Motion

Motion explains change: where something came from, what replaced what. Never ornamental,
never in the way. Every state change that would otherwise "pop" gets a transition.

| What                                            | Duration  | Curve       | Movement                                           |
| ----------------------------------------------- | --------- | ----------- | -------------------------------------------------- |
| Hover / pressed colours                         | 120ms     | ease-out    | colour only                                        |
| Menus, popovers, combos, tooltips (enter)       | 140–160ms | ease-out    | fade + 2–4px slide from the anchor, scale 0.98 → 1 |
| Same (exit)                                     | 100–120ms | ease-in     | fade only                                          |
| Composer dialog                                 | 180ms     | ease-out    | fade + 6px rise; veil fades                        |
| New message / block / card                      | 200–280ms | ease-out    | fade + 6px rise                                    |
| Expand / collapse (tool rows, "Show all")       | 180ms     | ease-in-out | height + fade, no jump                             |
| Tabs: open, close, reorder                      | 160ms     | ease-out    | width and position slide; neighbours make room     |
| Panels (sidebar ⌘B, git ⌥⌘B)                    | 200ms     | ease-in-out | width slide, content does not reflow mid-way       |
| Status changes (dots, badges, counts)           | 160ms     | ease-out    | cross-fade; working dots breathe                   |
| Inline confirmations (⌘W twice, discard, merge) | 120ms     | ease-out    | label cross-fade in place, no layout shift         |

- Animate `opacity` and `transform`; animate size only where the layout must move.
- Nothing above 300ms. Nothing that delays an action the user already took.
- Respect `prefers-reduced-motion`: keep fades, drop movement.
- Use tw-animate (`animate-in`, `fade-in`, `slide-in-from-*-[Npx]`, `zoom-in-[0.98]`) and
  Tailwind transitions; tw-animate only accepts whole steps or bracketed values.

## States

Every surface is designed in all its states before it ships:

- empty (with the keyboard path to fill it), loading (skeleton or quiet spinner, never a
  blank flash), error (says what failed and what to do, no "Error:" prefix), long content
  (truncation with full text on hover, at 1000px wide), disabled (why, in a tooltip);
- hover, pressed, keyboard focus (`focus-visible` only), selected, current;
- the working / waiting / done / failing signals, consistent everywhere they appear.

## Tokens

Colours, radii, shadows and type live as CSS variables in `src/styles.css` and are used
through Tailwind utilities (`bg-background`, `text-muted-foreground`, `border-border`,
`text-faint`, `bg-chrome`, `h-bar`, `shadow-popover`…). No raw hex in components; add a
token when one is missing. Light only for now; themes come from the same variables.

## Checking

Every UI change is checked in the browser preview (`bun run web:dev`, see CLAUDE.md) at
1000×600 and 1440×900: screenshot it, drive it by keyboard, watch the transitions. A change
is done when it looks finished in every state above, not when it works.
