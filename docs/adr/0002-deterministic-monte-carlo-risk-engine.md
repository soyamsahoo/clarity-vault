# ADR 0002: Deterministic Monte-Carlo Risk Engine

## Status

Accepted

## Context

Students need to understand the risk of repaying an education loan before committing to it. A static debt-to-income calculation is insufficient because entry salary, placement timing, job delays, salary growth, and interest-rate movements are all uncertain. We needed a risk model that:

- Produces repeatable results for the same inputs (so certificates/reports can be audited and replayed).
- Models Indian education-loan specifics: moratorium periods, simple interest capitalisation, reducing-balance EMIs, FOIR caps.
- Surfaces multiple stress scenarios (AI hiring shock, quiet placement season, delayed start, rate hike, combined stress).
- Is computationally light enough to run in-request on the NestJS API without a dedicated ML infrastructure.

## Decision

We implemented a deterministic Monte-Carlo simulation engine in `packages/utils/src/monte-carlo.ts`, exposed through the `@clarity/utils` package, and consumed by the `risk` module in `apps/api`.

### Core mechanics

- **PRNG:** `mulberry32` (32-bit multiplicative hash PRNG) seeded per simulation. A fixed default seed (`20261022`) ensures identical output for identical inputs across runs and environments.
- **Distributions:** Box-Muller normal and log-normal samplers built on the PRNG; log-normal used for entry salary so salaries stay positive and right-skewed.
- **Iterations:** Configurable (default 10,000), capped at 20,000 to bound request latency.
- **Horizon:** Simulates month-by-month cash flow over course duration + moratorium + tenure + 24 buffer months.

### Salary and employment model

- Placement is binomial with a configurable placement probability (default 0.82).
- Effective placement is softened by an AI-hiring shock percentage (default 20%).
- If placed, first-year salary is drawn from a log-normal distribution around the expected salary with a salary shock; if not placed, salary is scaled to 70% of expected.
- Job delay is stochastic: 0, 2, 4, 7, or 12 additional months based on uniform draws; unemployed paths add 12–24 months.
- Annual salary growth is normally distributed around 8% (±3.5%), clamped to [-6%, 26%].
- Living cost is a fixed percentage of salary (default 32%).

### Loan model

- Moratorium = course duration + grace months (default 6).
- Simple interest accrues during moratorium and is capitalised at repayment start (conservative Indian lender model).
- Reducing-balance EMI computed on capitalised principal.
- Optional floating-rate hike (bps) applied with 34% probability during repayment.

### Distress definition

Distress occurs when `(EMI + existing EMI) / salary > 40%` for 3 or more consecutive months during repayment. EMI-over-50% is tracked separately as a secondary threshold.

### Output metrics

- Probability of distress, probability of EMI > 50% of salary.
- Median and P90 months to payoff, total interest.
- Median and P10 emergency runway (graduation to first salary).
- First-year salary P10/P50/P90.
- Median DTI at P50, resilience score (0–100), plain-language verdict.
- Monthly cashflow curves (P10/P50/P90 over 60 months).
- DTI distribution buckets and stress map across salary × loan combinations.

### Stress scenarios

Six deterministic scenarios, each re-seeded from the base seed:

| Key | Label | Overrides |
|---|---|---|
| BASE | Base case | None |
| AI_SHOCK | AI hiring shock | `aiHiringShockPct: 20` |
| QUIET_P25 | Quiet season (25th percentile) | `expectedMonthlySalaryMultiplier: 0.75` |
| DELAYED_START | Delayed first job | `jobDelayMonths: 9` |
| RATE_HIKE | Rate hike | `rateHikeBps: 200` |
| COMBINED_STRESS | Combined stress | AI shock 25%, salary ×0.75, delay 9 months, rate hike 250 bps |

### Validation layer

Zod schemas in `packages/types/src/risk.ts` validate request inputs (`riskSimulationRequestSchema`) and shape the `RiskResult` response, including a `simulation: true` flag and disclaimer string so consumers know outputs are model estimates, not financial advice.

## Consequences

### Positive

- Reproducible risk reports: same seed + inputs = identical certificate/audit output.
- No external model serving infrastructure; runs in-process on the API.
- Multiple stress scenarios give students a range of outcomes, not a single point estimate.
- Pure TypeScript logic is easily unit-tested (`packages/utils/test/` with Vitest).

### Negative

- Deterministic PRNG means results are only as good as the seed and input distributions; real-world tail risks may be under-represented.
- 10,000 iterations per request adds CPU load; rate limiting and caching may be needed at scale.
- Salary and placement distributions are assumptions baked into code, not learned from historical data.

### Risks

- Seed leakage: if the seed is hardcoded, all users see identical scenario outcomes. Mitigation: allow optional client-provided seed while defaulting to a stable constant.
- Monte-Carlo variance: low iteration counts produce noisy P90 estimates; iteration cap trades precision for latency.

## Review

Revisit when we have historical placement/salary data to calibrate distributions, or when request volume requires moving simulation to a background worker queue.
