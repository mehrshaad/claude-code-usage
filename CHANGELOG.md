# Changelog

## 0.1.0

First release.

- Status bar meter for the rolling 5-hour usage block, with percent, reset countdown and threshold colours
- Dashboard panel: block and weekly gauges, today / session / burn / total tiles, per-model table, live session list, 30-day history
- Incremental transcript reader with `(message.id, requestId)` deduplication and a filesystem watcher for live updates
- Per-model costing with separate 5-minute and 1-hour cache-write rates
- Plan presets with auto-calibration, or explicit token ceilings
- ~35 settings covering meters, metrics, counting rules, cost, dashboard and notifications
