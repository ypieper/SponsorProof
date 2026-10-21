# Refactoring and local verification

The refactoring keeps Next.js, React, TypeScript and Supabase and adds no runtime
dependencies. Its UI and module extraction preserve the existing data model.
Sandbox verification also uncovered a role-check bug: migration
`20261021110000_fix_workspace_member_role_checks.sql` renames a PL/pgSQL variable
that conflicted with SQL's `CURRENT_ROLE` keyword. It preserves existing data
and restores the intended last-owner checks. It has only been applied to the
test project; production has not been migrated.

## Shared code

- `components/ui.tsx` remains the public entry point for presentation primitives.
  Implementations live in `components/ui/`.
- `components/modal.tsx` owns dialog focus, keyboard navigation, scrolling and
  dismissal. Pass `busy` while a request is in progress. Inner popovers should
  prevent their handled Escape event from reaching the dialog.
- `lib/benefit-workflow.ts` holds shared benefit status and quantity rules used
  by organizer views and the sponsor API. Benefits without tasks remain visible
  but do not contribute to task progress.
- `lib/tasks/types.ts`, `workflow.ts` and `input.ts` separate task models, workflow
  decisions and database insert values. `lib/tasks-storage.ts` retains its
  existing public exports and performs database access.
- `lib/event-metric-values.ts` calculates metrics from plain data. Fetching and
  the React hook remain in `lib/event-metrics.ts`.
- `components/tasks/` and `components/sponsor-portal/` contain the corresponding
  presentation components. Sponsor payload types and tab update rules live in
  `lib/sponsor-portal/`.
- `app/globals.css` imports the existing rules in their original order. See
  `app/styles/README.md` before changing the cascade.

Keep database writes and authorization in their existing storage/API layers.
Reusable status or progress calculations should not import React or connect to
Supabase. This allows them to be checked with plain fixtures.

## Checks without a database

Use the project's package manager:

```sh
pnpm typecheck
pnpm test
pnpm build
```

`pnpm test` uses TypeScript and Node's built-in test runner. It compiles fixtures
and pure modules into a temporary directory, then removes that directory.
It never reads `.env.local` or connects to Supabase.

The tests cover workflow dependencies, sponsor approval states, per-unit tasks,
untracked benefits, legacy evidence, event lifecycle, shared insert defaults,
status labels, progress limits and sponsor tab notifications.

## Database and browser integration

Local development now uses a dedicated hosted Supabase test project. See
`docs/test-environments.md` for the environment split, local credentials and
Preview deployment setup. Run the transactional database checks there with:

```sh
pnpm test:sandbox
```

This runner verifies the explicitly allowlisted test project before executing
SQL and rolls back every test fixture. It does not need Docker or production
credentials. Never use it against production.

A separate local Supabase stack remains supported. Supabase CLI and a supported
local container runtime are required; `supabase start` must succeed first.
`.env.test.example` documents its local addresses.

```sh
pnpm test:db
```

This command defaults to local PostgreSQL on port 54322. If
`SPONSO_TEST_DATABASE_URL` is supplied, it must use a loopback hostname and a
PostgreSQL protocol. Remote database URLs are rejected before the CLI runs.

Read-only UI checks can run in a separate development process with both
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` explicitly
empty. Use a fresh browser context and block external requests. The public demo
then checks sponsor rendering with fixed examples; organizer creation dialogs
can be opened and dismissed without submitting data.

The hosted sandbox contains fictional organizer/sponsor accounts and a sample
event with an invitation, upload task, dependent sponsor approval and event
metrics. Browser smoke checks are distinct from the SQL and unit suites; they
do not provide exhaustive end-to-end coverage of all application features.
