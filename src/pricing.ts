

export interface Price {
  input: number;
  output: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
  cacheRead: number;
}

/**
 * USD per million tokens. Cache write is 1.25x input for the 5-minute TTL and
 * 2x input for the 1-hour TTL; cache read is 0.1x input unless the model
 * publishes its own rate.
 */
function tier(input: number, output: number, cacheRead = input * 0.1): Price {
  return { input, output, cacheWrite5m: input * 1.25, cacheWrite1h: input * 2, cacheRead };
}

const TABLE: Record<string, Price> = {
  'claude-fable-5-1': tier(10, 50, 0.25),
  'claude-mythos-5-1': tier(10, 50, 0.25),
  'claude-fable-5': tier(10, 50),
  'claude-mythos-5': tier(10, 50),
  'claude-opus-5': tier(5, 25),
  'claude-opus-4-8': tier(5, 25),
  'claude-opus-4-7': tier(5, 25),
  'claude-opus-4-6': tier(5, 25),
  'claude-opus-4-5': tier(5, 25),
  'claude-opus-4-1': tier(15, 75),
  'claude-opus-4': tier(15, 75),
  'claude-sonnet-5': tier(2, 10),
  'claude-sonnet-4-6': tier(3, 15),
  'claude-sonnet-4-5': tier(3, 15),
  'claude-sonnet-4': tier(3, 15),
  'claude-3-7-sonnet': tier(3, 15),
  'claude-3-5-sonnet': tier(3, 15),
  'claude-haiku-4-5': tier(1, 5),
  'claude-3-5-haiku': tier(0.8, 4),
  'claude-3-haiku': tier(0.25, 1.25)
};

const FALLBACK: Price = tier(5, 25);

export function priceFor(
  model: string,
  overrides: Record<string, Partial<Price>> = {}
): Price {
  const id = model.toLowerCase();
  let base = TABLE[id];
  if (!base) {
    // Date-suffixed or unseen ids: longest matching known prefix wins.
    let best = '';
    for (const key of Object.keys(TABLE)) {
      if (id.startsWith(key) && key.length > best.length) { best = key; }
    }
    base = best ? TABLE[best] : FALLBACK;
  }
  const override = overrides[model] ?? overrides[id];
  return override ? { ...base, ...override } : base;
}

export interface TokenCounts {
  input: number;
  output: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
  cacheRead: number;
}

export function costOf(t: TokenCounts, price: Price): number {
  return (
    (t.input * price.input +
      t.output * price.output +
      t.cacheWrite5m * price.cacheWrite5m +
      t.cacheWrite1h * price.cacheWrite1h +
      t.cacheRead * price.cacheRead) /
    1_000_000
  );
}
