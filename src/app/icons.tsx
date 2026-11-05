// Stroke icons drawn at 24×24, sized by the `icon` / `icon-sm` classes.
const PATHS = {
  branch: (
    <>
      <path d="M6 3v12" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </>
  ),
  chart: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  chevron: <path d="m9 6 6 6-6 6" />,
  close: <path d="M18 6 6 18M6 6l12 12" />,
  external: <path d="M7 17 17 7M8 7h9v9" />,
  panelLeft: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
    </>
  ),
  panelRight: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M15 4v16" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1" />
      <circle cx="15" cy="6" r="2" />
      <circle cx="9" cy="12" r="2" />
      <circle cx="17" cy="18" r="2" />
    </>
  ),
}

export function Icon({ name, small = false }: { name: keyof typeof PATHS; small?: boolean }) {
  return (
    <svg className={small ? 'icon icon-sm' : 'icon'} viewBox="0 0 24 24" aria-hidden="true">
      {PATHS[name]}
    </svg>
  )
}
