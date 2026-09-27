# Megamind agent presence (ARCA)

The app — not the CLI — owns Megamind presence for the agent terminals it launches. A Claude Code
or Codex process only speaks MCP through the proxy (`arca/bin/arca-megamind-mcp.mjs`), and that
proxy would mint one session per process; the app already knows which pane is alive and when it
dies, so it registers the session and the proxy reuses the same id.

Contract: `plataforma/mainframe-chat/docs/ARCA-MEGAMIND-CONTRACT.md` (v5), §2.2 `register_agent`,
§2.3 `list_agents`, §2.9 `inbox`, §2.10 `acknowledge`, §2.11 `handoff`, §2.12 limits.

## One id per pane

`ARCA_MEGAMIND_SESSION_ID` is injected into every **local** agent PTY by
`src/main/arca-megamind/megamind-session-pty-env.ts`, from the same two env funnels the Pi account
env uses (`assemblePtyIpcSpawnEnv` and `buildTerminalWorkspaceEnv`). The id is **derived**, not
stored per pane: HMAC(profile salt, paneKey) shaped as a v4 UUID
(`megamind-pane-session-id.ts`). A PTY that outlives the app keeps the id it already has in its
environment, and after a restart the app derives the same one — a stored map would not survive
that, and rewriting a live shell's env is impossible.

SSH and WSL are excluded in v1: the execution host owns the agent, so an id minted here would name
a session nobody runs. The funnel also *strips* a stale id on those paths.

## What the hooks do

`hook-prompt-context.ts` (agent-hooks) reads pane, event name and cwd off the hook envelope and
hands them to `agent-presence-service.ts`, which maps them onto `MegamindAgentSessions`:

| Hook event | Effect |
|---|---|
| `SessionStart`, `UserPromptSubmit` (claude, codex) | `register_agent` (upsert) with project, harness, label, branch |
| every 60 s while the pane is not idle | the same `register_agent`, which renews `last_seen` (`active` is ≤120 s) |
| `Stop` | nothing — a finished turn is not a dead session |
| `SessionEnd`, PTY teardown (`paneKeyTeardownListeners`) | `handoff`, best effort |
| idle for `ARCA_MEGAMIND_IDLE_MINUTES` (default 30) | stops renewing; the gateway expires it |

Pi panes are never registered by the app: the Pi extension registers its own session.

The project id comes from the cwd — `git remote get-url origin` matched against `projects_list`,
falling back to the repository folder name. That is the same resolution the MCP proxy does from
`projects.json`, so both halves of one pane report the same project.

## Inbox as prompt context

On `UserPromptSubmit` the hook server answers the hook's own HTTP request with a body (every other
event still answers 204), and the managed hook script prints it:

- **Claude**: `text/plain`. The script already printed `{}` for the permission contract, so its
  stdout can never be the JSON form; Claude appends non-JSON UserPromptSubmit stdout to the turn.
- **Codex**: `application/json` with `hookSpecificOutput.additionalContext`, which is what the
  Codex hook wire schema accepts (`UserPromptSubmitHookSpecificOutputWire`).

The app waits at most `HOOK_PROMPT_CONTEXT_TIMEOUT_MS` (1.2 s) for the gateway, inside the script's
own `--max-time` (raised to 4 s **for this event only**; every other event keeps 1.5 s). On POSIX a
`case` over the captured payload picks the budget; cmd cannot capture stdin into a variable, so the
Windows hook buffers the payload into a temp file, `findstr`s the quoted event name in it and posts
`payload@<file>`. `acknowledge` runs **after** the response body
is written, never before: a prompt that timed out keeps its items pending for the next one.

The prompt path separates *registered* from *fresh*: a pane that is already registered goes straight
to the inbox and has its stale registration refreshed in the background. Only the first prompt of a
pane waits for `register_agent`. The workspace facts behind it (root, `origin`, branch) are cached
per cwd and invalidated by the mtime of that workspace's `HEAD`, so a heartbeat no longer costs
three `git` spawns per minute per pane.

## Rate and silence

All presence traffic shares one window of 60 calls/minute, under the gateway's 120/min per device
(§2.12), and registrations coalesce to one in-flight call per pane and at most one per heartbeat
period. Nothing is logged and nothing surfaces in the UI.

Failures are split (`megamind-call-failure.ts`): a device that cannot authenticate (no credential,
401/403, an `unauthorized` tool error) mutes presence for 5 minutes, because it will keep failing
until the user acts. A 429, a 5xx, a timeout or a dropped connection only costs a short exponential
wait (2 s, doubling to at most 60 s) that any successful call clears — one rate limit no longer
takes every pane's presence down with it.

## Not covered here

- Windows `.cmd` hooks carry the same response plumbing (temp file + `type`), but it has not been
  exercised on a real Windows host yet.
- SSH/WSL presence, `harness: "desktop"` (fase E) and the approval gate are out of scope.
