import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

export interface Config {
  source: 'auto' | 'account' | 'transcripts';
  apiPollSeconds: number;
  blockTokenLimit: number;
  weeklyTokenLimit: number;
  blockHours: number;
  weeklyMode: 'rolling7d' | 'calendar';
  weekStartsOn: 'sunday' | 'monday';
  statusBar: {
    enabled: boolean;
    alignment: 'left' | 'right';
    priority: number;
    metric: 'block' | 'week' | 'today' | 'session';
    showMeter: boolean;
    meterWidth: number;
    meterStyle: 'blocks' | 'bars' | 'dots' | 'ascii' | 'sparkline';
    showPercent: boolean;
    showReset: boolean;
    showTokens: boolean;
    showCost: boolean;
    showIcon: boolean;
    useColors: boolean;
    warnThreshold: number;
    dangerThreshold: number;
    clickAction: 'openDashboard' | 'cycleMetric' | 'refresh' | 'none';
  };
  refreshIntervalMs: number;
  watchFiles: boolean;
  claudeDir: string;
  lookbackDays: number;
  countInput: boolean;
  countOutput: boolean;
  countCacheWrites: boolean;
  countCacheReads: boolean;
  includeSubagents: boolean;
  projectFilter: 'all' | 'currentWorkspace';
  cost: {
    enabled: boolean;
    currencySymbol: string;
    pricing: Record<string, Partial<Record<'input' | 'output' | 'cacheWrite' | 'cacheRead', number>>>;
  };
  dashboard: {
    defaultRange: 'block' | 'today' | 'week' | 'month' | 'all';
    showSessions: boolean;
    maxSessions: number;
    showModels: boolean;
    showHistory: boolean;
    accentColor: string;
  };
  notifications: { enabled: boolean; thresholds: number[] };
}

export function readConfig(): Config {
  const c = vscode.workspace.getConfiguration('claudeUsage');
  const g = <T>(key: string, fallback: T): T => c.get<T>(key) ?? fallback;
  return {
    source: g('source', 'auto'),
    apiPollSeconds: g('apiPollSeconds', 60),
    blockTokenLimit: g('blockTokenLimit', 0),
    weeklyTokenLimit: g('weeklyTokenLimit', 0),
    blockHours: g('blockHours', 5),
    weeklyMode: g('weeklyMode', 'rolling7d'),
    weekStartsOn: g('weekStartsOn', 'monday'),
    statusBar: {
      enabled: g('statusBar.enabled', true),
      alignment: g('statusBar.alignment', 'right'),
      priority: g('statusBar.priority', 100),
      metric: g('statusBar.metric', 'block'),
      showMeter: g('statusBar.showMeter', true),
      meterWidth: g('statusBar.meterWidth', 10),
      meterStyle: g('statusBar.meterStyle', 'blocks'),
      showPercent: g('statusBar.showPercent', true),
      showReset: g('statusBar.showReset', true),
      showTokens: g('statusBar.showTokens', false),
      showCost: g('statusBar.showCost', false),
      showIcon: g('statusBar.showIcon', true),
      useColors: g('statusBar.useColors', true),
      warnThreshold: g('statusBar.warnThreshold', 60),
      dangerThreshold: g('statusBar.dangerThreshold', 85),
      clickAction: g('statusBar.clickAction', 'openDashboard')
    },
    refreshIntervalMs: g('refreshIntervalMs', 3000),
    watchFiles: g('watchFiles', true),
    claudeDir: g('claudeDir', ''),
    lookbackDays: g('lookbackDays', 30),
    countInput: g('countInput', true),
    countOutput: g('countOutput', true),
    countCacheWrites: g('countCacheWrites', true),
    countCacheReads: g('countCacheReads', true),
    includeSubagents: g('includeSubagents', true),
    projectFilter: g('projectFilter', 'all'),
    cost: {
      enabled: g('cost.enabled', true),
      currencySymbol: g('cost.currencySymbol', '$'),
      pricing: g('cost.pricing', {})
    },
    dashboard: {
      defaultRange: g('dashboard.defaultRange', 'block'),
      showSessions: g('dashboard.showSessions', true),
      maxSessions: g('dashboard.maxSessions', 8),
      showModels: g('dashboard.showModels', true),
      showHistory: g('dashboard.showHistory', true),
      accentColor: g('dashboard.accentColor', '#D97757')
    },
    notifications: {
      enabled: g('notifications.enabled', true),
      thresholds: g('notifications.thresholds', [75, 90])
    }
  };
}

export function resolveProjectsDir(cfg: Config): string {
  const base = cfg.claudeDir || process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  return path.join(base, 'projects');
}
