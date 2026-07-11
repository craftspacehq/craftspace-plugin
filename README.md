# Craftspace agent setups

Connects your coding agents to your team's [Craftspace](https://craftspace.app) company brain (shared
Pages, Skills, and Decisions over MCP) and makes sure decisions and learnings actually get written
back.

A bare MCP connection is advisory: agents routinely finish a session having made a real decision
without ever recording it. Two shared hooks fix that:

- **SessionStart** primes the read-first / write-back rules directly into context (not a truncatable
  server string).
- **Stop** blocks the end of a substantive session that recorded nothing and tells the model to
  record the decision (`create_decision`), note (`create_page`), or procedure (`create_skill`) — or
  explicitly decline. Nudges once, fails open, and understands both the Claude Code and Codex
  transcript formats.

## Claude Code

Install once, and it keeps itself up to date. Two one-time steps:

**1. Register the marketplace with auto-update on.** Add this to your `~/.claude/settings.json`
(create the file if it does not exist, and merge into `extraKnownMarketplaces` if you already have one):

```json
{
  "extraKnownMarketplaces": {
    "craftspace": {
      "source": { "source": "github", "repo": "abuaboud/craftspace-plugin" },
      "autoUpdate": true
    }
  }
}
```

`"autoUpdate": true` is the load-bearing part. Third-party marketplaces default to auto-update **off**,
so installing without this line leaves you frozen on whatever commit you installed and you never get
another update. With it, Claude Code pulls the latest commit at startup on its own.

**2. Install the plugin.**

```bash
claude plugin install craftspace@craftspace
```

The `plugin/` here bundles the MCP (OAuth on first connect) plus both hooks. Type `/mcp` and pick
**craftspace** to sign in right away.

That first-time setup is the only manual step. This plugin tracks its git HEAD (no pinned version),
so every new commit reaches you at your next Claude Code startup with no further action.

## Codex

Merge [`setups/codex/config.example.toml`](setups/codex/config.example.toml) into `~/.codex/config.toml`
and [`setups/codex/hooks.json`](setups/codex/hooks.json) into `~/.codex/hooks.json` (replace the path
placeholder with your checkout path). Codex speaks HTTP MCP with OAuth (`codex mcp login craftspace`)
or a `cst_` member-token header.

## Cursor

Drop [`setups/cursor/mcp.json`](setups/cursor/mcp.json) and
[`setups/cursor/hooks.json`](setups/cursor/hooks.json) into `~/.cursor/`. Unverified — Cursor is
GUI-only with no headless CLI, so it isn't covered by the test harness.

## Claude.ai / Desktop

Add `https://craftspace.app/mcp` as a custom connector. There's no client hook surface, so write-back
rides the server's own nudge.

## Testing

[`setups/run-setup-tests.mjs`](setups/run-setup-tests.mjs) drives each installed CLI (Claude Code,
Codex) through a decision task and a page task and asserts the record landed. See
[`setups/README.md`](setups/README.md).

## Releasing

The plugin carries no `version` field, so Claude Code resolves it to the current git commit. Every
commit pushed to the default branch is immediately live for everyone who installed with
`autoUpdate: true` — push equals ship, there is no version to bump. Keep the default branch
always-shippable: do risky work on a branch and merge only when it is safe to distribute. There is no
per-teammate rollback; the recovery path is a forward-fixing commit.

Nothing here is secret: just the public MCP endpoint and small hook scripts. The source of truth is
the Craftspace monorepo; this repo is the published mirror.
