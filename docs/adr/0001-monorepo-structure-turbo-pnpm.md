# ADR 0001: Monorepo Structure with Turbo and pnpm Workspaces

## Status

Accepted

## Context

Clarity Vault began as a single repository containing a NestJS API, an Expo mobile application, and shared domain logic. As the surface area grew, coupling between the API and mobile client increased, and shared types/utils were duplicated across projects. We needed a structure that enforces module boundaries, enables independent deployment, and keeps dependency installation fast.

## Decision

We adopted a Turborepo monorepo managed by pnpm workspaces at the repository root (`D:\saas`).

### Repository layout

```
apps/
  api/          # @clarity/api — NestJS 11 backend
  mobile/     # @clarity/mobile — Expo 58 + React Native
packages/
  config/     # @clarity/config — shared ESLint, Tailwind, tsconfig
  database/   # @clarity/database — Prisma schema, client, embedded Postgres, seeds
  types/      # @clarity/types — shared Zod schemas + TS types
  ui/         # @clarity/ui — shared React Native UI components
  utils/      # @clarity/utils — pure logic: money, cost certainty, risk, underwriting
docs/adr/     # Architecture Decision Records
```

### Package manager: pnpm 9.x

- Workspaces declared in `pnpm-workspace.yaml` include both `apps/*` and `packages/*`.
- Internal packages resolve via `workspace:*` ranges, guaranteeing local symlinks rather than registry publishes.
- `pnpm-lock.yaml` is committed for deterministic installs.
- `postinstall` runs `pnpm db:generate` and builds `@clarity/types`, `@clarity/utils`, and `@clarity/database` so consuming apps always have compiled artifacts.

### Build orchestrator: Turborepo 2.x

Configured in `turbo.json`:

- `build` tasks depend on `^build` (upstream packages first), outputs to `dist/**` and `web-build/**`.
- `typecheck` and `test` depend on `^build`.
- `lint` has no cache outputs.
- `dev` is uncached and persistent (long-running dev servers).
- `generate` is uncached.

### Shared packages

| Package | Responsibility | Exported as |
|---|---|---|
| `@clarity/types` | Zod schemas + TypeScript types for all domain models (API contracts) | CJS + ESM + DTS |
| `@clarity/utils` | Pure logic: money/loan math, cost certainty, Monte-Carlo risk, bank underwriting, deterministic PRNG | CJS + ESM + DTS |
| `@clarity/ui` | Shared React Native components (buttons, banners, forms, surfaces, text, theme) | Source files (NativeWind) |
| `@clarity/database` | Prisma schema, Prisma Client, embedded Postgres dev DB, seed scripts | CJS + DTS |
| `@clarity/config` | Shared ESLint base, Tailwind preset, library tsconfig | Config files only |

### Dependency flow

```
apps/api   → @clarity/database, @clarity/types, @clarity/utils, @clarity/config
apps/mobile → @clarity/config, @clarity/types, @clarity/ui, @clarity/utils
packages/database → @clarity/utils, @clarity/types, @clarity/config
packages/utils → @clarity/types, @clarity/config
packages/ui → @clarity/config (peer deps: nativewind, react, react-native)
```

## Consequences

### Positive

- Single source of truth for domain types; API and mobile share Zod schemas.
- Independent versioning and publishing path for internal packages if needed.
- Incremental builds via Turborepo caching; only changed packages rebuild.
- Consistent lint, format, and TypeScript configuration across all projects.
- Fast `pnpm install` due to content-addressable store and workspace dedup.

### Negative

- All packages share one major version (`0.1.0`); coordinated releases required.
- `postinstall` build step adds latency to fresh checkouts.
- Developers must run from the repo root (`pnpm --filter ...`) for scoped commands.

### Risks

- Circular dependencies between internal packages could break the build order; enforced by Turborepo `^build` dependencies and TypeScript project references.
- pnpm strict peer dependencies may surface when React/React Native versions drift between `apps/mobile` and `packages/ui`.

## Review

Revisit when the monorepo exceeds ~10 packages or when independent deployment cadences diverge significantly between API and mobile.
