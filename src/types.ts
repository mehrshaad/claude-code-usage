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
}

export type PlanId = 'pro' | 'max5' | 'max20' | 'team' | 'api' | 'custom';

export interface PlanLimits {
  block: number;
  week: number;
}

/**
 * Anthropic does not publish subscription limits as token counts, so these are
 * approximations used only as meter denominators. Observed usage above them
 * raises the denominator when autoCalibrate is on.
 */
export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  pro: { block: 19_000_000, week: 190_000_000 },
  max5: { block: 88_000_000, week: 880_000_000 },
  max20: { block: 220_000_000, week: 2_200_000_000 },
  team: { block: 88_000_000, week: 880_000_000 },
  api: { block: 0, week: 0 },
  custom: { block: 0, week: 0 }
};
