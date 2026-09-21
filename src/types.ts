export interface UsageEvent {
  ts: number;
  model: string;
  input: number;
  output: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
  cacheRead: number;
  sessionId: string;
  project: string;
  isSidechain: boolean;
}

export interface Totals {
  input: number;
  output: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
  cacheRead: number;
  counted: number;
  raw: number;
  cost: number;
  messages: number;
}

export interface Window {
  start: number;
  end: number;
  totals: Totals;
  limit: number;
  percent: number;
  /** False when no percentage exists at all - render tokens, not a meter. */
  hasPercent: boolean;
  /** True when the percentage is measured against a limit rather than reported. */
  estimated: boolean;
  remainingMs: number;
}

export interface ModelRow {
  model: string;
  totals: Totals;
}

export interface SessionRow {
  sessionId: string;
  project: string;
  lastTs: number;
  active: boolean;
  totals: Totals;
}

export interface DayRow {
  /** Bucket key: a date for daily rows, a date and hour for hourly ones. */
  date: string;
  /** Short axis label. */
  label: string;
  counted: number;
  cost: number;
}

export interface Snapshot {
  block: Window;
  week: Window;
  today: Totals;
  session: SessionRow | undefined;
  models: ModelRow[];
  sessions: SessionRow[];
  history: DayRow[];
  /** Which resolution the history is in, so the panel can title it. */
  historyMode: 'day' | 'hour';
  burnPerMin: number;
  burnSeries: number[];
  projectedExhaustionMs: number | undefined;
  scannedFiles: number;
  eventCount: number;
  lastUpdate: number;
  costEnabled: boolean;
  source: 'account' | 'transcripts';
  /** Denominators in force, for the panel footer. */
  blockLimit: number;
  weekLimit: number;
  /** Plan actually in force, after inference. */
  plan: string;
  /** Age of the account reading being shown, when one is. */
  reportAgeMs: number | undefined;
  opusWeek: number | undefined;
  sonnetWeek: number | undefined;
}
