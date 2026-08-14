# Craftspace agent setups

Connects your coding agents to your team's [Craftspace](https://craftspace.app) company brain and makes
sure decisions and learnings get written back. Claude Code uses a local MCP bridge, so it can work with
complete plugin folders while the company brain stays hosted and shared.

A bare MCP connection is advisory: agents routinely finish a session having made a real decision
without ever recording it. Two shared hooks fix that:

- **SessionStart** primes the read-first / write-back rules directly into context (not a truncatable
  server string).
- **Stop** blocks the end of a substantive session that recorded nothing and tells the model to
  record the decision (`upsert_decision`), note (`upsert_page`), or procedure (`upsert_skill`) — or
  explicitly decline. Nudges once, fails open, and understands both the Claude Code and Codex
  transcript formats.

## Claude Code

Install once, connect each repo once, and it keeps itself up to date:

**1. Register the marketplace with auto-update on.** Add this to your `~/.claude/settings.json`
(create the file if it does not exist, and merge into `extraKnownMarketplaces` if you already have one):

```json
{
  "extraKnownMarketplaces": {
    "craftspace": {
      "source": { "source": "github", "repo": "craftspacehq/craftspace-plugin" },
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

This installs the house rules, the `/grill-me` skill, both hooks, and the local MCP bridge. The bridge
advertises no tools until a repo pins its org in `.craftspace.json`, so it cannot guess an org or quietly
write to the wrong one.

**3. Pin the repo to its company brain.** Add `.craftspace.json` at the repo root:

```json
{ "org": "<org-slug>" }
```

Your slug is the one in the app URL, `/o/<org-slug>`. If this repo already has a hosted
`craftspace-<org-slug>` server in `.mcp.json`, remove it. Hosted and local expose the same tools, so
Claude Code should see only the bundled local server.

**4. Give this machine access.** In Craftspace, open **Connect your agent**, choose **Claude Code**,
and create a local access token. Then start Claude once with the token in memory:

```bash
read -s CRAFTSPACE_TOKEN
export CRAFTSPACE_TOKEN
claude
unset CRAFTSPACE_TOKEN
```

The bridge stores the token with mode `0600` under Claude's plugin data directory, outside the repo.
Future launches use plain `claude`. The hosted service remains authoritative for permissions, plugin
state, pages, and connected apps. The local process only forwards calls and performs rooted folder I/O.

Installing the plugin is one time; connecting is once per repo. The plugin tracks its git HEAD with no
pinned version, so every new commit reaches you at your next Claude Code startup with no further action.

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

Add `https://craftspace.app/mcp/<org-slug>` as a custom connector (your slug is the one in the app
URL, `/o/<org-slug>`; a bare `/mcp` is refused for accounts in more than one org). There's no client
hook surface, so write-back rides the server's own nudge.

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

This repository is the source of truth for the installed client plugin. The hosted plugin package
service lives in the Craftspace product repository.
