# Claude Code Usage

Live Claude Code token usage in the VS Code status bar, with a full breakdown panel.

Reads the transcripts Claude Code already writes to `~/.claude/projects` and turns them into a meter you can glance at while you work. Nothing leaves your machine.

## What it shows

**Status bar** — a chunk meter for the current session limit, percent used, and time until it resets:

```
▰▰▰▰▰▰▱▱▱▱  62% · 1h47m
```

The item turns amber at the warning threshold and red at the danger threshold. Click it to open the dashboard, or set it to cycle between block / week / today / session.

Width is fixed for every value — percentages reserve three digits and durations are always `NhNNm` — so nothing in the status bar cluster shifts as the numbers tick. Six meter styles are available; `halfblocks` resolves to ~1.25% per cell if you want the fill to creep rather than step, and `ascii` renders anywhere.

**Dashboard** — a side panel with:

- session and weekly limit gauges, with a caret on the bar marking where the current burn rate lands by reset
- per-model weekly figures when your account is connected
- today, active session, burn rate (tokens/min) and total tiles
- per-model table with tokens, cost and message counts
- live session list, active sessions marked
- 30-day history bars

## Install

From the VS Code Marketplace: search **Claude Code Usage**.

From a `.vsix`:

```bash
code --install-extension claude-code-usage-0.1.0.vsix
```

## How the numbers are built

Every assistant message Claude Code writes carries a `usage` block. This extension sums them, with three corrections that matter:

- **Deduplication.** One logical assistant message is written as several JSONL lines (one per content block), and resumed sessions copy earlier lines verbatim. Lines are keyed on `(message.id, requestId)`, so nothing is counted twice — without this, totals roughly double.
- **Cache tiers are priced apart.** `cache_creation` splits into 5-minute and 1-hour TTLs, billed at 1.25× and 2× the input rate. They are costed separately, not lumped together.
- **Subagents count.** Sidechain messages are real usage and are included by default (`claudeUsage.includeSubagents` turns them off).

Only bytes appended since the last pass are parsed, so a refresh costs a few milliseconds even with tens of thousands of transcripts on disk. A filesystem watcher triggers a refresh the moment Claude Code writes, with polling as a fallback.

### Where the percentages come from

**Limit percentages cannot be derived from transcript tokens.** Claude computes them server-side, and they are weighted very differently from raw usage: a session window holding 68M transcript tokens reports single-digit utilization, because cache reads — which dominate every total — barely count toward the limit. Any extension that sums JSONL tokens and calls the result a percentage is guessing, and will be wrong by an order of magnitude.

So percentages come from your account, the same source `/usage` reads — using the Claude Code sign-in already on this machine. There is nothing to set up: if you are signed in to Claude Code, the session and weekly gauges match `/usage` exactly, including the per-model weekly figures. macOS asks once for keychain access the first time VS Code reads it.

If no sign-in can be found (or the store is unreadable), **Claude Usage: Paste Account Token** takes a token from `claude setup-token` and keeps it in VS Code's encrypted secret storage.

Without a sign-in the extension still works — tokens, cost, burn rate, per-model and per-session breakdowns, all local — but it shows **no percentage**, rather than a fabricated one. If you want a meter anyway, set `claudeUsage.blockTokenLimit` and `claudeUsage.weeklyTokenLimit` to ceilings of your own choosing.

Costs use the published per-million-token API rates, including cache write and read multipliers. On a subscription the dollar figure is notional — what the same traffic would cost on the API. Turn it off with `claudeUsage.cost.enabled`, or override rates per model with `claudeUsage.cost.pricing`.

## Settings

| Setting | Default | What it does |
| --- | --- | --- |
| `claudeUsage.source` | `auto` | Where percentages come from: account, transcripts, or auto |
| `claudeUsage.apiPollSeconds` | `60` | How often to refresh limits from your account |
| `claudeUsage.blockTokenLimit` | `0` | Fallback block ceiling when not connected (`0` = no meter) |
| `claudeUsage.weeklyTokenLimit` | `0` | Fallback weekly ceiling when not connected (`0` = no meter) |
| `claudeUsage.blockHours` | `5` | Length of a usage block |
| `claudeUsage.weeklyMode` | `rolling7d` | Rolling 168 hours or calendar week |
| `claudeUsage.weekStartsOn` | `monday` | First day of the calendar week |
| `claudeUsage.statusBar.metric` | `block` | Primary metric: block / week / today / session |
| `claudeUsage.statusBar.meterStyle` | `ticks` | `ticks`, `halfblocks`, `blocks`, `braille`, `ascii`, `sparkline` |
| `claudeUsage.statusBar.meterWidth` | `10` | Number of meter segments |
| `claudeUsage.statusBar.showTokens` | `false` | Show the raw token total in the status bar |
| `claudeUsage.statusBar.showCost` | `false` | Show cost in the status bar |
| `claudeUsage.statusBar.showReset` | `true` | Show time until the window resets |
| `claudeUsage.statusBar.warnThreshold` | `60` | Percent that turns the item amber |
| `claudeUsage.statusBar.dangerThreshold` | `85` | Percent that turns the item red |
| `claudeUsage.statusBar.clickAction` | `openDashboard` | Click behaviour |
| `claudeUsage.statusBar.alignment` | `right` | Status bar side |
| `claudeUsage.refreshIntervalMs` | `3000` | Polling interval |
| `claudeUsage.watchFiles` | `true` | Refresh immediately on transcript writes |
| `claudeUsage.lookbackDays` | `30` | Days of history to load |
| `claudeUsage.claudeDir` | `""` | Override the Claude Code data directory |
| `claudeUsage.countCacheReads` | `true` | Count cache reads (they dominate totals) |
| `claudeUsage.countCacheWrites` | `true` | Count cache-creation tokens |
| `claudeUsage.includeSubagents` | `true` | Include sidechain (subagent) messages |
| `claudeUsage.projectFilter` | `all` | Count everything or only the open workspace |
| `claudeUsage.cost.enabled` | `true` | Compute and show cost |
| `claudeUsage.cost.pricing` | `{}` | Per-model rate overrides |
| `claudeUsage.dashboard.accentColor` | `#D97757` | Accent colour for gauges |
| `claudeUsage.notifications.thresholds` | `[75, 90]` | Percentages that raise a warning |

Full list with descriptions: **Settings → Extensions → Claude Code Usage**.

## Commands

| Command | Description |
| --- | --- |
| `Claude Usage: Open Dashboard` | Reveal the side panel |
| `Claude Usage: Refresh Now` | Force a rescan pass |
| `Claude Usage: Cycle Status Bar Metric` | Switch block / week / today / session |
| `Claude Usage: Paste Account Token (fallback)` | Only needed when no Claude Code sign-in is found |
| `Claude Usage: Remove Pasted Token` | Forget a pasted token |
| `Claude Usage: Toggle Cost Display` | Show or hide dollar figures |
| `Claude Usage: Copy Stats to Clipboard` | Copy the current summary |
| `Claude Usage: Full Rescan (clear cache)` | Rebuild from disk |

## Privacy

The extension reads local transcript files — only their `usage` counters, model ids, timestamps, session ids and working-directory names, never message content. It has no telemetry and sends nothing anywhere.

For limit percentages it makes exactly one kind of network request: a periodic `GET https://api.anthropic.com/api/oauth/usage` carrying your existing Claude Code credential, which returns your own limit percentages. The credential is read from the local store Claude Code already uses — it is never copied, written elsewhere, or sent anywhere but that endpoint. Set `claudeUsage.source` to `transcripts` to disable the lookup entirely.

## Development

```bash
npm install
npm run compile      # bundle to out/
npm run watch        # rebuild on change
npm run typecheck    # tsc --noEmit
npm run package      # build a .vsix
```

Press <kbd>F5</kbd> in VS Code to launch an Extension Development Host.

## Licence

MIT
