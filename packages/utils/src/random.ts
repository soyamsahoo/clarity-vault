/**
 * Deterministic PRNG utilities. The Monte-Carlo engine must be reproducible
 * for a given seed so that a certificate/risk report can be replayed.
 */

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** Box-Muller normal sample. */
export function normal(rand: () => number, mean = 0, sd = 1): number {
  const u1 = Math.max(rand(), Number.EPSILON);
  const u2 = rand();
  return mean + sd * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/** Lognormal with a desired arithmetic mean and log-space sigma. */
export function lognormal(rand: () => number, mean: number, sigma = 0.28): number {
  if (mean <= 0) return 0;
  const mu = Math.log(mean) - (sigma * sigma) / 2;
  return Math.exp(mu + sigma * normal(rand, 0, 1));
}

export function pickWeighted<T>(
  rand: () => number,
  options: Array<{ value: T; weight: number }>,
): T {
  const total = options.reduce((sum, option) => sum + option.weight, 0);
  let ticket = rand() * total;
  for (const option of options) {
    ticket -= option.weight;
    if (ticket <= 0) return option.value;
  }
  const last = options[options.length - 1];
  if (!last) throw new Error('pickWeighted requires at least one option');
  return last.value;
}

export function quantile(sortedValues: number[], q: number): number {
  if (sortedValues.length === 0) return 0;
  const position = (sortedValues.length - 1) * q;
  const base = Math.floor(position);
  const rest = position - base;
  const lower = sortedValues[base] ?? 0;
  const upper = sortedValues[base + 1] ?? lower;
  return lower + rest * (upper - lower);
}
