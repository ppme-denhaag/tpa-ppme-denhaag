# TPA PPME Den Haag

Progress-tracking PWA for PPME Den Haag's TPA (Taman Penitipan Al-Quran) program —
attendance, homework, Yanbu'a/Quran/Murajaah progress, and year-end reports for
tutors, parents, and students.

Full specs live in [`docs/`](./docs): [PRD](./docs/PRD-PPME-TPA.md),
[TAD](./docs/TAD-PPME-TPA.md), [dev checklist](./docs/PPME-TPA-Development-Checklist.md),
[API contract](./docs/openapi.yaml), [test plan](./docs/test-plan.md).

## Stack

React + Vite + TypeScript + Tailwind CSS v4, Supabase (Postgres + Auth + Storage,
Frankfurt/eu-central-1), Netlify (hosting + Functions), react-i18next (id/nl),
vite-plugin-pwa (Workbox).

## Local development

```bash
npm install
cp .env.example .env   # fill in VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
                        # from Supabase dashboard > Project Settings > API
npm run dev
```

```bash
npm run typecheck   # tsc -b --noEmit
npm run test         # Vitest unit tests
npm run test:e2e     # Playwright (starts its own dev server)
npm run build         # production build
```

## Database

Migrations live in `supabase/migrations/` (001–005, applied in order). The
project is already linked (`supabase/config.toml` + `supabase link`); to apply
a new migration:

```bash
supabase db push
```

There is no local Postgres for dev — Docker isn't available in this environment,
so `supabase start` (local emulation) doesn't work here. Local dev talks directly
to the Frankfurt project. **Never point tests or local dev at data you wouldn't
want in a shared dev database** — see test-plan.md's "no real student data in
any test environment, ever" rule.

## RLS automated test suite

`supabase/tests/database/rls.test.sql` implements all 21 cases from
test-plan.md §3 (RLS-01…RLS-21) as pgTAP assertions, using the standard
fixture set from §2. It runs entirely inside a transaction that's rolled
back at the end, so it never leaves data behind. CI runs it against a
fresh local Postgres (Docker, via the Supabase CLI) built from
`supabase/migrations` — see the `rls` job in `.github/workflows/test.yml`.

To run it yourself against the live linked project (also transactionally
rolled back, safe to repeat):

```bash
supabase db query --linked -f supabase/tests/database/rls.test.sql
```

**While building this suite, it surfaced a critical bug**: migrations
002/003/005 defined RLS policies but never granted the underlying
`anon`/`authenticated`/`service_role` table privileges those policies
depend on — GRANT is a separate, prerequisite gate in front of RLS, so
every single API request (including from `service_role`, i.e. Netlify
Functions) was getting "permission denied" regardless of how correct the
RLS policies were. Fixed in migration `007_grants.sql`. This means the
app was non-functional at the database layer from when migrations 002/003
were first applied until this fix — worth knowing if anything was tested
against the live project in that window and appeared broken.

## Known gaps (foundation pass — not yet built)

- **No real PPME logo asset for PWA icons.** The top nav now uses the real
  logo (`public/logo.png`), but the source file is only 135×70px, so the
  512px PWA icons (`public/icons/*.png`) are a soft ~3.7x upscale — fine as
  a placeholder, replace with a proper square/high-res (512×512+) source
  before real launch.
- **Feature UI is not built.** Attendance, homework, Yanbu'a, Quran, Murajaah,
  and Reports are placeholder pages behind real auth/role/RLS. See the checklist's
  suggested build order for what's next.
- Bundle isn't code-split yet (single ~500KB JS chunk) — fine at this size, revisit
  once feature modules grow.
