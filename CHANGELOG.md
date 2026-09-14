# Changelog

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
