# Changelog

## 0.5.5

- Fixed the status bar vanishing after a settings change. Every change recreated the status bar item, and disposing a live item to immediately recreate it under the same id could leave the bar empty until the next poll. Only alignment and priority need a rebuild now; everything else is applied in place
- Added `claudeUsage.dashboard.numberFont`. Numbers use the editor font for tabular figures, which can clash with the interface font used by the labels; set it to `ui` for one typeface throughout

## 0.5.4

- The default meter is now half-step blocks. The circle styles mix Unicode blocks - `○` (U+25CB), `●` (U+25CF) and the quadrant glyphs `◔◑◕` (U+25D1-25D5) - and many editor fonts draw them at different sizes and advance widths, so the meter visibly changed size as it filled. Block elements share one advance width everywhere. The circle styles remain available

## 0.5.2

- Fixed the release workflow: the publish step's condition read `env.VSCE_PAT`, which a step's own `env` block does not populate, so it skipped on every tag. The token now lives at job level
- Release artifacts carry the extension's current name

## 0.5.1

- Circle steps are now the default status bar meter. They shipped in 0.5.0 behind a setting, which meant nothing changed unless you went looking. `ticks` remains available as `claudeUsage.statusBar.meterStyle`

## 0.5.0

Implements the updated design.

- New status bar treatment, circle steps: `●●●●●●◔○○○`. Quarter-resolved cells give 2.5% steps, four times the resolution of the block meters, and a remainder always rounds up so any progress into a cell is visible. `circleHalves` is the fallback for fonts that lack the quadrant glyphs at monospace width
- The session gauge can be a ring (`claudeUsage.dashboard.gaugeStyle`): 86px, 8px stroke, hero percent inside, and the burn projection becomes a tick on the circumference, where its angle reads as a position in the window. The bar stays the default, so the session and week gauges share one shape
- New icon: the open dial wrapped around the mascot — the ring reports 62%, the creature says whose tool it is

## 0.4.1

Panel fixes found by rendering it against real data.

- Fixed columns in the model and session tables ran together (`169M$99.83304` was three values). They now carry real separation and a little more width
- The week gauge showed nothing on the right when no per-model figures were available; it now always says when the window resets
- The 2px share rule sat flush under the model name and read as an underline
- Bar tracks stay visible in themes that define no widget border, and a fill can no longer outrun its track
- A non-finite percentage would emit `width:NaN%`, which the browser discards - leaving the bar at its auto width, i.e. reading as 100%. Percentages are now validated before they reach the DOM, in the panel and the status bar both
- The view is titled Claude Code Meter to match the published name

## 0.4.0

- Limit percentages now use the Claude Code sign-in already present on this machine, so there is nothing to connect. Pasting a token is only a fallback for machines where that store cannot be read
- The credential is re-read periodically, so Claude Code refreshing its own token is picked up without a reload
- Marketplace publisher id corrected to `Mehrshad`

## 0.3.0

Implements the design system: an instrument, not a dashboard.

- Status bar: spaced-tick meter by default, plus half-step, solid, braille, ASCII and sparkline styles. Fixed width for every value — three reserved percent digits, `NhNNm` durations — so the cluster never shifts
- Transient states: braille scanning spinner, idle, no-data, and an over-cap reading that keeps counting past 100%
- Panel rebuilt to spec: 18px hero percent with a burn-projection caret on the bar, week at 13px, a 1px tile grid instead of cards, fixed right-aligned model columns with a 2px share rule, session dots as the only green, 30-day bars at lowest ink
- Every colour but the coral accent now resolves from a VS Code theme variable; zero radii, zero shadows, 240ms linear bar creep as the only motion
- Scanning keeps the full skeleton with em-dashes so the panel never reflows when the first read lands
- New icon: an open dial, the one candidate whose monochrome 20px form still reads as a quantity

## 0.2.0

Fixes a wrong premise in 0.1.0: limit percentages were estimated from transcript token sums against guessed plan ceilings. They were wrong by roughly an order of magnitude — a window Claude reported as 7% used showed as 61%.

- Percentages now come from the account usage endpoint, the same source `/usage` reads, via **Claude Usage: Connect Account** (token held in VS Code `SecretStorage`)
- Weekly per-model figures surfaced alongside the totals
- Without a connected account the extension shows tokens, cost and burn rate and **no percentage**, instead of a fabricated one
- Plan presets and auto-calibration removed; `blockTokenLimit` / `weeklyTokenLimit` remain as opt-in fallback ceilings
- Usage windows anchor to the exact first message rather than the top of the hour, matching Claude's on-the-minute reset times ("resets 1:40pm")

## 0.1.0

First release.

- Status bar meter for the rolling 5-hour usage block, with percent, reset countdown and threshold colours
- Dashboard panel: block and weekly gauges, today / session / burn / total tiles, per-model table, live session list, 30-day history
- Incremental transcript reader with `(message.id, requestId)` deduplication and a filesystem watcher for live updates
- Per-model costing with separate 5-minute and 1-hour cache-write rates
- Plan presets with auto-calibration, or explicit token ceilings
- ~35 settings covering meters, metrics, counting rules, cost, dashboard and notifications
