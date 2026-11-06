// What the app asks Claude to do on the user's behalf.

/** What "Ask for PR" sends: the app never opens a PR itself, Claude does it with gh. */
export const PR_PROMPT =
  'Open a pull request for this branch with gh: push it first if needed, and write the title and description from the commits. Reply with its URL.'

export const SETUP_PROMPT = (script: string) =>
  `Write the setup script at ${script}. It runs in every new git worktree of this project, ` +
  'from the worktree root, to install what a fresh checkout lacks: dependencies, .env files ' +
  'copied from the main checkout, caches. Replace the stub; keep `#!/usr/bin/env bash` and ' +
  '`set -euo pipefail`. Make it idempotent and non-interactive, use no secrets, exit ' +
  'non-zero on failure. Do not run it.'
