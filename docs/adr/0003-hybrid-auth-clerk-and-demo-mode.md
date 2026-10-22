# ADR 0003: Hybrid Auth — Clerk with Demo Mode Bypass

## Status

Accepted

## Context

Clarity Vault needs authentication for both the NestJS API (`apps/api`) and the Expo mobile app (`apps/mobile`). The long-term target is Clerk for managed user identity, sessions, and multi-factor auth. However, during early development the team needs to iterate quickly without configuring Clerk instances, creating test users, or handling OAuth callbacks on every checkout.

We needed an auth strategy that:

- Ships with Clerk as the production auth provider.
- Works out-of-the-box on a fresh clone with zero external accounts.
- Lets the API and mobile app share the same user model (Clerk ID as the canonical external subject).
- Makes the switch from demo to Clerk explicit and auditable (via environment variable presence).

## Decision

We adopted a hybrid authentication model:

- **Demo mode (default):** When `CLERK_SECRET_KEY` is absent, the API falls back to a demo auth bypass. A fixed demo clerk ID (`demo_student`) and demo admin (`demo_admin`) are seeded into the database. Requests are authenticated as the demo student unless headers/roles indicate otherwise. The mobile app still requires `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` (per the Expo Router root layout), but in demo mode it can point the client at the API with a mock token or skip Clerk initialization for offline development.
- **Clerk mode:** When `CLERK_SECRET_KEY` is present, the API uses `@clerk/backend` to verify Clerk JWTs. `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` powers the Expo client via `@clerk/expo`.

### API layer (`apps/api`)

- `ClerkAuthGuard` (global `APP_GUARD`): authenticates requests. In demo mode it bypasses Clerk verification and injects a demo user context. In Clerk mode it verifies the `Authorization: Bearer <token>` header using `@clerk/backend`.
- `RolesGuard` (global `APP_GUARD`): enforces role-based access (STUDENT / ADMIN) on top of the authenticated user.
- `PrismaExceptionFilter` (global `APP_FILTER`): translates Prisma errors to HTTP responses without leaking internals.
- `SimulationHeaderInterceptor` (global `APP_INTERCEPTOR`): adds `X-Clarity-Mode` response header (`demo` or `clerk`) so clients can detect the active auth mode.
- `AppController` health endpoint reports whether Clerk auth is available or demo mode is active.

### Mobile layer (`apps/mobile`)

- `app/_layout.tsx` wraps the app in `ClerkProvider` using `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`. If the key is missing, it throws a clear error directing the developer to run `clerk auth login`, `clerk link`, and `clerk env pull`.
- In demo mode the mobile app can still connect to the API; the API-side demo guard handles authentication, so the mobile client is not blocked by missing Clerk configuration during early UI development.

### User model

The Prisma `User` model stores `clerkId` (`@unique`) as the external subject identifier. In demo mode the seed creates `clerkId = 'demo_student'` and `clerkId = 'demo_admin'`. When migrating to Clerk, real Clerk user IDs simply replace these values; no schema change is required.

### Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `CLERK_SECRET_KEY` | Optional | Enables Clerk auth on the API. Absent = demo mode. |
| `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` | Required for mobile | Clerk publishable key for `@clerk/expo`. |
| `EXPO_PUBLIC_API_URL` | Recommended | API base URL for mobile client calls. |
| `EXPO_PUBLIC_SIMULATION_MODE` | Optional | Explicit simulation-mode toggle for the client. |

## Consequences

### Positive

- Zero-config local development: `pnpm setup` works without a Clerk account.
- Production-ready auth path already integrated; flipping `CLERK_SECRET_KEY` switches modes.
- Shared user model (`clerkId`) means no migration of the `User` table when enabling Clerk.
- `X-Clarity-Mode` header makes the active auth mode visible in API responses and logs.

### Negative

- Demo mode bypasses real authentication; must never be used in production. Protected by the absence of `CLERK_SECRET_KEY` (which production environments will always set).
- Mobile app root layout throws without `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`, so Expo development still requires the key even in API demo mode. Mitigation: provide a `.env.example` with placeholder guidance.

### Risks

- Accidental production deployment in demo mode if `CLERK_SECRET_KEY` is unset. Mitigation: deployment pipelines should fail if `CLERK_SECRET_KEY` is missing in non-local environments.
- Demo user hardcoded in seed data could be guessed; demo mode is intended for local/dev only, not staging or production.

## Review

Revisit before any production or staging deployment. At that point, remove the demo bypass path or gate it behind an explicit `DEMO_AUTH_ENABLED` flag in addition to `CLERK_SECRET_KEY` absence.
