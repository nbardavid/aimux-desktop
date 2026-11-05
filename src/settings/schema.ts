// The settings the TUI keeps in the `settings` object of the profile's aimux.json
// (src/settings/sections/*). Rows the TUI rewrites from its own state (theme, bars, git
// pane layout) are not here: an edit to them would be overwritten while the TUI runs.

export type SettingValue = boolean | number | string

export type Row =
  | { kind: 'toggle'; id: string; label: string; help: string; fallback: boolean; restart?: true }
  | {
      kind: 'number'
      id: string
      label: string
      help: string
      fallback: number
      min: number
      max: number
      step: number
      restart?: true
    }
  | {
      kind: 'text'
      id: string
      label: string
      help: string
      fallback: string
      placeholder?: string
    }
  | { kind: 'select'; id: string; label: string; help: string; fallback: string; options: string[] }

export interface Section {
  id: string
  label: string
  rows: Row[]
}

export const SECTIONS: Section[] = [
  {
    id: 'automation',
    label: 'Automation',
    rows: [
      {
        fallback: false,
        help: 'Offer a generated commit message when you commit from git mode.',
        id: 'autoCommit.enabled',
        kind: 'toggle',
        label: 'Auto-commit',
      },
      {
        fallback: 60000,
        help: 'How long the assistant gets to produce one, in milliseconds.',
        id: 'autoCommit.timeoutMs',
        kind: 'number',
        label: 'Auto-commit timeout',
        max: 300000,
        min: 10000,
        step: 10000,
      },
      {
        fallback: true,
        help: 'Name a tab from the first real prompt you send it.',
        id: 'autoRename.enabled',
        kind: 'toggle',
        label: 'Auto-rename tabs',
        restart: true,
      },
      {
        fallback: 2500,
        help: 'Quiet period after a prompt before a title is generated, in milliseconds.',
        id: 'autoRename.settleMs',
        kind: 'number',
        label: 'Auto-rename settle',
        max: 10000,
        min: 0,
        restart: true,
        step: 500,
      },
      {
        fallback: 3,
        help: 'Tries before falling back to a title derived from the prompt itself.',
        id: 'autoRename.maxAttempts',
        kind: 'number',
        label: 'Auto-rename attempts',
        max: 10,
        min: 1,
        restart: true,
        step: 1,
      },
      {
        fallback: 3,
        help: 'Shorter prompts are menu answers, not something to name a tab after.',
        id: 'autoRename.minPromptWords',
        kind: 'number',
        label: 'Auto-rename minimum words',
        max: 20,
        min: 1,
        restart: true,
        step: 1,
      },
      {
        fallback: 15000,
        help: 'How long a title gets to come back, in milliseconds.',
        id: 'autoRename.timeoutMs',
        kind: 'number',
        label: 'Auto-rename timeout',
        max: 60000,
        min: 5000,
        restart: true,
        step: 5000,
      },
      {
        fallback: '',
        help: 'Extra rules for the branch a new workspace is named after.',
        id: 'autoRename.branchInstructions',
        kind: 'text',
        label: 'Branch naming rules',
        placeholder: 'e.g. prefix with the ticket number',
      },
    ],
  },
  {
    id: 'notifications',
    label: 'Notifications',
    rows: [
      {
        fallback: 'plane',
        help: '"off" disables it. Custom sounds dropped in the sounds folder show up in the TUI.',
        id: 'notifications.sound',
        kind: 'select',
        label: 'Sound',
        options: ['off', 'plane', 'bell', 'ding'],
      },
      {
        fallback: 35,
        help: 'Loudness of the sound, in percent.',
        id: 'notifications.volume',
        kind: 'number',
        label: 'Volume',
        max: 100,
        min: 0,
        step: 5,
      },
    ],
  },
  {
    id: 'git',
    label: 'Git',
    rows: [
      {
        fallback: true,
        help: 'Added and removed line counts next to each file.',
        id: 'git.diffCount',
        kind: 'toggle',
        label: 'Diff counts',
      },
      {
        fallback: true,
        help: 'A Nerd Font glyph by file type. Turn off when the font has none.',
        id: 'git.icons',
        kind: 'toggle',
        label: 'File icons',
      },
      {
        fallback: 5,
        help: 'Load this many diffs either side of the cursor ahead of time. 0 disables it.',
        id: 'git.prefetchRadius',
        kind: 'number',
        label: 'Diff prefetch',
        max: 50,
        min: 0,
        step: 1,
      },
      {
        fallback: true,
        help: 'Fetch the base branch before forking from it. Off forks from your local copy.',
        id: 'git.fetchBase',
        kind: 'toggle',
        label: 'Refresh the base branch',
      },
      {
        fallback: '.env',
        help: 'Files copied from the main checkout into a new workspace. Comma-separated globs.',
        id: 'git.worktreeCopyFiles',
        kind: 'text',
        label: 'Seed new workspaces with',
      },
      {
        fallback: true,
        help: 'Aggregate the status of git repos nested under the project.',
        id: 'multiRepo.enabled',
        kind: 'toggle',
        label: 'Multi-repo',
      },
      {
        fallback: 1,
        help: 'How far below the project to look for them. 1 = its direct children.',
        id: 'multiRepo.maxDepth',
        kind: 'number',
        label: 'Multi-repo depth',
        max: 5,
        min: 1,
        step: 1,
      },
    ],
  },
  {
    id: 'commands',
    label: 'Commands',
    rows: [
      {
        fallback: ':',
        help: 'Type this, then a trigger, to expand a snippet. One character.',
        id: 'snippets.triggerChar',
        kind: 'text',
        label: 'Snippet trigger',
      },
      {
        fallback: '',
        help: 'Model that writes the commit message when Claude is the active tab.',
        id: 'autoCommit.models.claude',
        kind: 'text',
        label: 'Commit model (Claude)',
        placeholder: 'default',
      },
      {
        fallback: '',
        help: 'Model that writes the commit message when Codex is the active tab.',
        id: 'autoCommit.models.codex',
        kind: 'text',
        label: 'Commit model (Codex)',
        placeholder: 'default',
      },
    ],
  },
  {
    id: 'editor',
    label: 'Editor',
    rows: [
      {
        fallback: '',
        help: 'Overrides $VISUAL and $EDITOR. Empty falls back to them.',
        id: 'externalEditor.command',
        kind: 'text',
        label: 'Command',
        placeholder: '$VISUAL',
      },
      {
        fallback: 'auto',
        help: 'Whether the editor opens its own window or takes over a terminal.',
        id: 'externalEditor.kind',
        kind: 'select',
        label: 'Window',
        options: ['auto', 'gui', 'tui'],
      },
    ],
  },
  {
    id: 'statusBar',
    label: 'Status bar',
    rows: [
      {
        fallback: 'arrow',
        help: 'Glyph between sections in the TUI. All but "none" need a Nerd Font.',
        id: 'statusBar.separator',
        kind: 'select',
        label: 'Separator',
        options: ['arrow', 'round', 'slant', 'flame', 'none'],
      },
      {
        fallback: true,
        help: 'The keybinding row under the TUI bar. Off frees a line.',
        id: 'statusBar.hints',
        kind: 'toggle',
        label: 'Keybinding hints',
      },
      {
        fallback: 180,
        help: 'Seconds between two quota reads. Claude refuses callers faster than 180.',
        id: 'statusBar.aiUsage.pollSeconds',
        kind: 'number',
        label: 'AI usage refresh',
        max: 3600,
        min: 180,
        step: 60,
      },
    ],
  },
  {
    id: 'integrations',
    label: 'Integrations',
    rows: [
      {
        fallback: false,
        help: 'Drive per-tab activity from Claude Code events instead of reading the screen.',
        id: 'integrations.claudeHooks',
        kind: 'toggle',
        label: 'Claude Code hooks',
        restart: true,
      },
    ],
  },
  {
    id: 'experimental',
    label: 'Experimental',
    rows: [
      {
        fallback: false,
        help: "Turn off Claude's own highlighting and re-colour diffs from the aimux theme.",
        id: 'theme.beta.experimentalSyntaxHighlight',
        kind: 'toggle',
        label: 'Syntax highlight from the theme',
        restart: true,
      },
      {
        fallback: false,
        help: 'A little animation per agent state, instead of the spinner and the dots.',
        id: 'theme.beta.experimentalActivitySprites',
        kind: 'toggle',
        label: 'Activity sprites (Kitty or Ghostty)',
      },
    ],
  },
]

/** What the TUI applies: a stored value of the right type, clamped like the TUI clamps it. */
export function effectiveValue(row: Row, stored: SettingValue | undefined): SettingValue {
  switch (row.kind) {
    case 'toggle':
      return typeof stored === 'boolean' ? stored : row.fallback
    case 'number':
      return typeof stored === 'number'
        ? Math.min(row.max, Math.max(row.min, stored))
        : row.fallback
    case 'select':
      return typeof stored === 'string' && row.options.includes(stored) ? stored : row.fallback
    case 'text':
      return typeof stored === 'string' ? stored : row.fallback
  }
}
