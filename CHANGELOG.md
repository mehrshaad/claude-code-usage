# Changelog

## 0.9.0

- The mascot is now the extension's mark wherever VS Code allows one: the activity bar rail, and the status bar. The status bar renders codicons only - no SVG, no images - so the mascot ships as a contributed icon font, which is the single supported route for custom artwork there
- `ticks` is back to `▰▱` and is drawn from that same icon font rather than the editor font. Text glyph size belongs to the editor font; a contributed icon is drawn at icon size, so the meter is larger without being wider
- `bars` added as a separate style, keeping the `▮▯` rectangles from 0.8.1
- The activity bar icon is the mascot itself, cropped to its own bounds with the eyes punched through as a fill rule rather than painted over, since VS Code uses that icon as a mask

## 0.8.1

- The `ticks` meter used `▰▱`, slanted parallelograms that render small in most editor fonts. It now uses `▮▯`, vertical rectangles with the same separated-segment reading at a much taller glyph

## 0.8.0

- Circle styles merged into one. `circles` now uses only empty, half and full - the quadrant glyphs are gone, since they are not metrically compatible across editor fonts
- The half circle filled from the wrong side. `◑` fills from the right, which reads backwards in a meter that grows left to right; it is now `◐`. Any remainder shows a half circle, so 94% no longer renders identically to 100%
- The status bar icon is the robot rather than a heartbeat
- Panel numbers use the interface font by default. The editor font gives tabular figures that never change width, and remains available as `claudeUsage.dashboard.numberFont`
- Hovering a wide setting no longer highlights the whole block. Rows that contain their own options - meter style, gauge style, font, accent, thresholds, pricing - highlight per option instead
- `circleHalves` still works as a setting value and resolves to `circles`

## 0.7.0

The meter no longer needs a connected account.

- Percentages are estimated against a plan ceiling when the account is unavailable, and marked with a tilde (`~14%`) everywhere they appear so an estimate never reads as a measurement
- `claudeUsage.plan` selects the ceiling. `auto`, the default, infers the plan from the largest block this machine has reached - calibrating directly to that peak was rejected, since the heaviest window would then always read 100%
- The presets are back-calculated from a measured account rather than guessed, and reproduce its readings to within rounding. 0.1.0's invented ceiling is what produced the 61%-versus-7% error; this is the same feature built on measurement
- Settings that cannot affect anything in the current state are now dimmed, including across sections and from runtime state: the plan and token ceilings while the account reports real numbers, the meter and threshold settings while no percentage exists at all, and the status bar's cost toggle while cost display is off

## 0.6.4

- The status bar item can no longer render as an empty string, which shows as no item at all. Whatever the combination of settings, it falls back to the token count
- Show Diagnostics now reports the status bar's own state: whether it is enabled, which metric is in force and whether that came from the cycle command, whether the item exists, and its current text

## 0.6.3

- Meter style previews rendered as empty glyph runs. They preview at your real percentage, which is 0 with no account connected, so every style showed as all-empty and the list was unreadable. They now fall back to a representative value
- Changing the status bar metric in settings did nothing once the Cycle Status Bar Metric command had been used. The cycle override outlived every later configuration change; an explicit setting now wins
- The account notice has a heading like every other block, says plainly what the percentages are for, and links out to your usage page on claude.ai
- Title bar icons replaced with VS Code's own codicons. The dial glyphs did not survive 16px as flat images and read as broken circles

## 0.6.2

- Fixed the refresh and settings icons rendering black. VS Code loads title bar icons as images, where `currentColor` has nothing to inherit and resolves to black - so both were near-invisible on dark themes. They now ship as explicit light and dark variants

## 0.6.1

Fixes found by end-to-end testing of 0.6.0.

- The settings surface broke a few seconds after opening. The panel sends a percent-only update on every snapshot, and the settings module replaced its whole state from that payload, wiping the spec and values and throwing on the next render. It now merges
- The fallback token limits no longer dim under `source: auto`. They apply there whenever the account is unreachable; only `account` makes them genuinely inert
- Meter style notes no longer wrap to a second line at 300px

## 0.6.0

All 46 settings are now editable in the sidebar, implementing the settings design.

- Two-level drill-down: seven section rows fit one screen at 300px, each showing how many settings it holds and how many differ from default. A filter matches both labels and dotted keys, so `countCacheReads` is findable by typing "cache"
- The meter never leaves the column: opening settings collapses the gauge to a 30px strip keeping percent, bar and reset countdown, including its threshold colour
- Live preview wherever a setting is visual: all eight meter styles render at your real percentage, the width slider shows the glyph run it is choosing, the gauge styles are two live miniatures, and the font choice renders the same token count in both faces
- The four hard controls are real controls: per-model rate cards with an em-dash for inherited rates, threshold chips over a 0-100 scale, a path field with a folder picker, and four curated accent swatches with a hex field
- A 2px gutter answers "is this mine?" for every row - coral for user-changed, grey for values held in settings.json, which are shown read-only with a tag that opens the file
- Reset at three scopes (setting, section, everything) with inline confirmation, never a modal over a 300px column
- Dependent settings indent with a hairline and dim to 45% when their parent is off; Status bar collapses to one line when disabled rather than showing fifteen dimmed rows
- Refresh and settings icons redrawn on the logo's dial grid

## 0.5.6

- Fixed the panel telling you to run a command that no longer existed. 0.4.0 renamed Connect Account to "Paste Account Token (fallback)" but the panel kept naming the old title, so searching the command palette for it found nothing. The command is called Connect Account again
- The panel now offers buttons instead of instructions: Connect account, and "Why not?" which opens the diagnostics
- Clarified the wording: the Claude Code sign-in is read automatically, and pasting a token is the fallback when that read fails

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
