# aimux desktop

A macOS app for working with Claude on several things at once. Each piece of work gets its
own git worktree, with its chats and terminals beside it. Chats are the real `claude` binary
run headless, drawn natively. Close the window and they keep working: a background process
holds every Claude and every terminal, and the window picks them back up when it reopens.

## Install

Apple Silicon, with [Claude Code](https://claude.com/claude-code) installed.

```sh
curl -L https://github.com/nbardavid/aimux-desktop/releases/latest/download/aimux_aarch64.app.tar.gz | tar -xz -C /Applications
```

The app updates itself afterwards: when a release is out, an "Update to x.y.z" pill appears
in the top bar. An update restarts the window only; chats and terminals keep running.

## Develop

```sh
bun install
bun run dev
```

`bun run dev` runs "aimux Dev", a separate app with its own data and background process, so
it sits beside the installed aimux without touching it. Checks:
`bun run lint && bun run format && bun test && (cd src-tauri && cargo test)`.

## Release

```sh
bun bump patch   # or minor, major, or an exact 0.3.0
```

It computes the next version (semver), builds and signs the app on this Mac (Apple silicon),
then commits, tags, pushes and publishes the GitHub release with `gh`. A failed build pushes
nothing. Updates are signed with a key kept outside the repo (`~/.tauri/aimux-desktop.key`);
installed apps refuse anything else.

## Origin

This app started in the `desktop/` folder of [BrimVeyn/aimux](https://github.com/BrimVeyn/aimux),
the terminal multiplexer for AI CLIs, and its history comes from there. Its background
process follows the design of aimux's daemon. MIT, see [LICENSE](LICENSE).
