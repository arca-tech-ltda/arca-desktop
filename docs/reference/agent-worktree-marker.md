# Agent worktree marker

A worktree created by a parallel agent (sub-agent, orchestrator, CI helper) is not a
forgotten checkout. ARCA classifies those separately so the sidebar groups them as
"agents working" instead of offering the "keep hidden / show in worktree list" prompt.

## How ARCA decides

In order, on the execution host that owns the checkout:

1. **Explicit marker** — `arca-agent.json` inside the worktree's own git admin
   directory (`<git-common-dir>/worktrees/<name>/`). It is outside the working tree, so
   it never appears in `git status`, never needs a `.gitignore` entry, and is deleted by
   `git worktree remove` along with the rest of the registration.
2. **Temp-directory heuristic** — the worktree path is under a temp root of the host:
   `os.tmpdir()`, plus `/tmp` and `/private/tmp` on macOS, plus `%TEMP%`/`%TMP%` on
   Windows (compared case-insensitively there).

Anything else keeps the existing "discovered worktree" behaviour.

## Writing the marker

There is no CLI command for this: one `git` call plus a file write is the whole
contract. Run this inside the worktree:

```sh
printf '%s' '{"agent":"claude","task":"Fix the sidebar grouping","createdBy":"orchestrator"}' \
  > "$(git rev-parse --git-dir)/arca-agent.json"
```

On Windows PowerShell:

```powershell
$gitDir = git rev-parse --git-dir
'{"agent":"codex","task":"Fix the sidebar grouping"}' | Set-Content -NoNewline "$gitDir/arca-agent.json"
```

`git rev-parse --git-dir` inside a linked worktree already points at
`<git-common-dir>/worktrees/<name>`, so no path assembly is needed.

## Format

All fields are optional — a well-formed `{}` is still proof that an agent wrote it.

| Field       | Type             | Meaning                                                        |
| ----------- | ---------------- | -------------------------------------------------------------- |
| `agent`     | string           | Agent/CLI name shown on the row (`claude`, `codex`, …).          |
| `task`      | string           | What the agent is doing; used as the row title when present.     |
| `createdBy` | string           | Who spawned the agent (orchestrator, automation, user).          |
| `createdAt` | number \| string | Epoch milliseconds or an ISO date; drives the row's age.         |

Unknown fields are ignored. Strings are trimmed and capped at 500 characters. A
malformed or unparsable file falls through to the temp-directory heuristic rather than
failing the scan.

Agents that already work in `/tmp` (or `%TEMP%`) are detected without any marker; write
one anyway when you want the task text and agent name on the row.
