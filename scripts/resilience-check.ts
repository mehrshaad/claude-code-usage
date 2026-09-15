import { UsageApi } from '../src/usageApi';

/** A stand-in for the endpoint, driven by a scripted sequence of outcomes. */
type Step = { kind: 'ok'; pct: number } | { kind: 'status'; code: number } | { kind: 'throw' };
let script: Step[] = [];
let calls = 0;

(globalThis as any).fetch = async () => {
  const step = script[Math.min(calls++, script.length - 1)];
  if (step.kind === 'throw') { throw new Error('network is unreachable'); }
  if (step.kind === 'status') {
    return { ok: false, status: step.code, statusText: 'x', json: async () => ({}) } as unknown as Response;
  }
  const resets = new Date(Date.now() + 3_600_000).toISOString();
  return {
    ok: true, status: 200, statusText: 'OK',
    json: async () => ({
      five_hour: { utilization: step.pct, resets_at: resets },
      seven_day: { utilization: 38, resets_at: resets }
    })
  } as unknown as Response;
};

const secrets = { get: async () => 'test-token', store: async () => {}, delete: async () => {} };

async function run(label: string, steps: Step[], expect: (string | number)[]) {
  script = steps; calls = 0;
  const api = new UsageApi(secrets as never);
  const seen: (string | number)[] = [];
  let now = Date.now();
  for (let i = 0; i < steps.length; i++) {
    // Poll as the extension does, then clear any backoff so the next scripted
    // step is actually attempted rather than skipped.
    now += 60_000;
    const r = await api.refresh(now);
    (api as unknown as { nextAttemptAt: number }).nextAttemptAt = 0;
    seen.push(r ? Math.round(r.fiveHour!.utilization) : 'none');
  }
  const ok = JSON.stringify(seen) === JSON.stringify(expect);
  console.log(`  ${ok ? ' ok ' : 'FAIL'}  ${label.padEnd(44)} ${seen.join(' → ')}`);
  return ok;
}

(async () => {
  let pass = 0, total = 0;
  const check = async (...a: Parameters<typeof run>) => { total++; if (await run(...a)) { pass++; } };

  await check('token rotation: 401 then retry succeeds',
    [{ kind: 'ok', pct: 60 }, { kind: 'status', code: 401 }, { kind: 'ok', pct: 62 }],
    [60, 62, 62]);

  await check('rate limited: keeps the last reading',
    [{ kind: 'ok', pct: 60 }, { kind: 'status', code: 429 }, { kind: 'ok', pct: 64 }],
    [60, 60, 64]);

  await check('network drops: keeps the last reading',
    [{ kind: 'ok', pct: 60 }, { kind: 'throw' }, { kind: 'throw' }, { kind: 'ok', pct: 66 }],
    [60, 60, 60, 66]);

  await check('server error: keeps the last reading',
    [{ kind: 'ok', pct: 55 }, { kind: 'status', code: 503 }, { kind: 'ok', pct: 57 }],
    [55, 55, 57]);

  await check('never succeeded: reports nothing rather than guessing',
    [{ kind: 'status', code: 500 }, { kind: 'throw' }],
    ['none', 'none']);

  // A long outage must eventually stop reporting a figure that is no longer true.
  total++;
  script = [{ kind: 'ok', pct: 60 }, { kind: 'throw' }]; calls = 0;
  const outage = new UsageApi(secrets as never);
  const start = Date.now();
  await outage.refresh(start);
  const at5 = await outage.refresh(start + 5 * 60_000);
  const at20 = await outage.refresh(start + 20 * 60_000);
  const decays = at5 !== undefined && at20 === undefined;
  if (decays) { pass++; }
  console.log(`  ${decays ? ' ok ' : 'FAIL'}  ${'reading survives 5m outage, drops by 20m'.padEnd(44)} ${at5 ? '5m: served' : '5m: dropped'}, ${at20 ? '20m: served' : '20m: dropped'}`);

  // A reading must not outlive its own window.
  total++;
  script = [{ kind: 'ok', pct: 90 }, { kind: 'throw' }]; calls = 0;
  const api = new UsageApi(secrets as never);
  const t0 = Date.now();
  await api.refresh(t0);
  const afterReset = await api.refresh(t0 + 2 * 3_600_000);
  const okReset = afterReset === undefined;
  if (okReset) { pass++; }
  console.log(`  ${okReset ? ' ok ' : 'FAIL'}  ${'stale reading dropped after its reset'.padEnd(44)} ${afterReset ? 'still served' : 'dropped'}`);

  // Backoff must actually throttle.
  total++;
  script = [{ kind: 'throw' }]; calls = 0;
  const api2 = new UsageApi(secrets as never);
  const base = Date.now();
  await api2.refresh(base);
  const before = calls;
  await api2.refresh(base + 1000);
  const throttled = calls === before;
  if (throttled) { pass++; }
  console.log(`  ${throttled ? ' ok ' : 'FAIL'}  ${'backoff suppresses an immediate retry'.padEnd(44)} ${throttled ? 'suppressed' : 'hammered'}`);

  console.log(`\n${pass}/${total} resilience checks passed`);
})();
