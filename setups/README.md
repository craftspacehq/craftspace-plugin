# Agent setups: make write-back reliable, and test it

A bare MCP connection to Craftspace is advisory. The server ships read-first / write-back rules in
its `instructions`, but clients truncate them and nothing forces the agent to act, so a session can
make a real decision and finish having recorded nothing. These setups close that gap per client, and
`run-setup-tests.mjs` verifies the fix by actually driving each agent and checking the record landed.

## The two levers

1. **SessionStart hook** (`hooks/session-start.mjs`) — prints the house rules to stdout, which the
   client folds into context every session. The reliable channel the truncatable `instructions` are
   not.
2. **Stop hook** (`hooks/stop.mjs`) — on the first stop of a session that did real work but called no
   craftspace write tool, it blocks and tells the model to record the decision/learning now (or say
   in one line why nothing is worth keeping). Nudges once (`stop_hook_active` is the escape hatch),
   fails open, and understands both the Claude Code and Codex transcript formats. Blocks via exit
   code 2 + a stderr reason, which Claude Code, Codex, and Cursor all honor.

The hooks only *read* the transcript to decide whether to nudge — the agent still authors every
record by calling the MCP tool itself, so capture stays agent-driven (ADR 0041), and the hooks just
make sure it happens (ADR 0047).

## Per client

| Client | MCP | Forcing hooks | Verified here |
|---|---|---|---|
| **Claude Code** | plugin bundles it (OAuth) | plugin's `Stop` + `SessionStart` | ✅ headless test + live e2e |
| **Codex** | `codex/config.example.toml` (OAuth or token) | `codex/hooks.json` → shared scripts | ✅ writes via MCP nudge (headless); hooks are the same proven format Codex already runs for other memory tools |
| **Cursor** | `cursor/mcp.json` | `cursor/hooks.json` → shared scripts | ⚠️ config provided, **not** run — Cursor is GUI-only, no headless CLI |
| **Claude.ai / Desktop** | custom connector (OAuth) | none — no hook surface | relies on the MCP nudge only |

- **Claude Code**: `claude plugin marketplace add abuaboud/craftspace-plugin && claude plugin install craftspace@craftspace`. The plugin is the packaged version of these same two hooks plus the MCP.
- **Codex**: merge `codex/config.example.toml` into `~/.codex/config.toml` and `codex/hooks.json` into
  `~/.codex/hooks.json` (replace the path placeholder). Codex complied even without the hooks in
  testing, but the hooks make it deterministic.
- **Cursor**: drop `cursor/mcp.json` and `cursor/hooks.json` into `~/.cursor/`. Unverified.
- **Claude.ai / Desktop**: add the custom connector; there is no client hook surface, so write-back
  rides the server nudge alone.

## Running the tests

```bash
CRAFTSPACE_TEST_TOKEN=cst_… node setups/run-setup-tests.mjs            # all detected CLIs
CRAFTSPACE_TEST_TOKEN=cst_… node setups/run-setup-tests.mjs --only codex --repeat 3
```

For each CLI on `PATH` (Claude Code, Codex) it runs a **decision** task and a **page** task whose
subject carries a unique nonce — neither prompt mentions Craftspace or "record this" — then asserts
over the MCP that a record carrying that nonce now exists. It exits non-zero if any write is missing.

Mint the token in the web app (Setup → member token). It never touches the repo; the harness reads
it from the environment. The test records land in the real org under `[setup-test]` titles, and the
MCP has no delete tool, so delete them from the web app afterward.
