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
  /** False when no authoritative percentage exists - render tokens, not a meter. */
  hasPercent: boolean;
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
  date: string;
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
  burnPerMin: number;
  burnSeries: number[];
  projectedExhaustionMs: number | undefined;
  scannedFiles: number;
  eventCount: number;
  lastUpdate: number;
  costEnabled: boolean;
  source: 'account' | 'transcripts';
  opusWeek: number | undefined;
  sonnetWeek: number | undefined;
}
