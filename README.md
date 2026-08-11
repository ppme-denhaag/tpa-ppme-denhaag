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

Migrations live in `supabase/migrations/` (001–007, applied in order). The
project is already linked (`supabase/config.toml` + `supabase link`); to apply
a new migration:

```bash
supabase db push
```

### Local Postgres (requires Docker)

`supabase start` runs a full local stack (Postgres, GoTrue, PostgREST, Storage)
via Docker and applies `supabase/migrations/` automatically — this is how CI's
`rls` job runs, and it's the safest way to develop/test against real RLS
without touching the linked Frankfurt project:

```bash
supabase start   # first run pulls several images, can take a few minutes
supabase stop    # tears the stack down; add --no-backup to also drop the volume
```

If `docker ps` fails with a permission error, your user likely isn't in the
`docker` group yet: `sudo usermod -aG docker $USER`, then start a fresh login
session (the group change doesn't apply to already-running shells — in a pinch,
`sg docker -c "supabase start"` picks it up without a new login).

Point `.env` at the local stack (`API_URL`/`ANON_KEY` from the `supabase start`
output, both under `http://127.0.0.1:54321`) to run `npm run dev` against it
instead of Frankfurt. **Never point tests or local dev at data you wouldn't
want in a shared dev database** — see test-plan.md's "no real student data in
any test environment, ever" rule; this applies to the linked project, not the
local Docker stack, which is disposable and per-machine.

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
- **Attendance and Yanbu'a (Milestone 1) are built**; homework, Quran, Murajaah,
  and Reports are still placeholder pages behind real auth/role/RLS. See the
  checklist's suggested build order for what's next — notifications/Netlify
  Functions (§4) and offline/PWA sync polish (§5) are next up, deliberately
  deferred from Milestone 1.
- Bundle isn't code-split yet (single ~500KB JS chunk) — fine at this size, revisit
  once feature modules grow.
