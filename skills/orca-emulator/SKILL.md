---
name: orca-emulator
description: >-
  iOS Simulator control from inside ARCA, with the live device view in ARCA's
  emulator pane. Use when driving a booted Apple Simulator on macOS: taps,
  gestures, typing, hardware buttons, rotation, and the accessibility tree, or
  when an iOS change needs simulator evidence. For an Android device or emulator
  use the Android emulator skill; build and install the app with xcodebuild or
  simctl first.
license: Apache-2.0
---

# ARCA Emulator

This discovery stub loads the version-matched guide from the ARCA executable used for this session.

Prefer ARCA over raw `serve-sim` or direct `simctl` for simulator control inside ARCA; it
handles device scoping, helper lifecycle, and worktree context.

## Resolve the CLI for this session

Choose the executable once and reuse it for every later command:

- If the `ORCA_CLI_COMMAND` environment variable is set, use its value. ARCA exports this
  for managed WSL sessions.
- Otherwise, in a dev checkout whose session exposes `ORCA_DEV_REPO_ROOT`, use `orca-dev`.
- Otherwise, on Linux outside an Orca-managed terminal, use `orca-ide`. Never run bare
  `orca` there — outside ARCA's terminals it normally resolves to the
  GNOME Orca screen reader (`/usr/bin/orca`) and starts speech on the user's machine.
- Otherwise, use `orca`.

Below, `ORCA` is a placeholder for the executable you resolved. Substitute it before
running anything; do not create a shell variable or run `ORCA` literally. This works the
same way in POSIX shells, PowerShell, and cmd.exe.

If the selected executable cannot run, report its exact error and stop. Do not fall through
to another executable, which could silently target a different ARCA build.

## Load the version-matched guide before running ARCA commands

```text
ORCA skills get orca-emulator
```

Prefer `--json`. Use the selected executable's `--help` for commands or flags the guide does
not cover. If a command reports that ARCA is not running, start it with `ORCA open --json`
and retry. If it fails with `runtime_access_denied`, your sandbox blocked the connection:
re-run it with escalated permissions, and do not run `ORCA open` or restart ARCA. If
`skills get` is unknown, explain that updating ARCA restores the guide; use `--help` for
read-only discovery and do not guess unsupported commands.
