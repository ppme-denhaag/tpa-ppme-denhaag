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
npm run typecheck            # tsc -b --noEmit (src/)
npm run typecheck:functions  # tsc -p netlify/functions (Netlify Functions, not covered by the above)
npm run test                  # Vitest unit tests
npm run test:e2e              # Playwright (starts its own dev server)
npm run build                  # production build
```

## Database

Migrations live in `supabase/migrations/` (001–008, applied in order). The
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

#### Dev fixture + fixture sign-in (no real Google OAuth needed)

`supabase/dev-fixture.sql` seeds a small realistic dataset (tutor, admin,
2 parents, 2 classes, 4 students, 1 pending/unregistered sign-in) into a
local stack — load it after migrations are applied:

```bash
supabase migration up --local
docker exec -i supabase_db_tpa-ppme-denhaag \
  psql -U postgres -v ON_ERROR_STOP=1 < supabase/dev-fixture.sql
```

With `.env` pointed at the local stack, `npm run dev` then shows a
"Dev only" sign-in panel (`src/dev/DevAuthSwitcher.tsx`, gated on
`import.meta.env.DEV` and confirmed absent from production builds) on the
sign-in screen — pick any fixture identity to get a real authenticated
session against the local stack without configuring Google OAuth
(`supabase/config.toml` has no `[auth.external.google]` section locally).

**Gotcha if you ever hand-write `auth.users` rows yourself** (dev-fixture.sql
already does this correctly): PostgREST/RLS never look at `instance_id` or
the `*_token`/`*_change` columns — they only validate the JWT signature and
trust its claims. But `supabase.auth.setSession()` (what the fixture sign-in
panel uses) calls GoTrue's own `/auth/v1/user` endpoint, which does a real
row lookup and scan. A `NULL` `instance_id` makes that lookup silently match
nothing (`"User from sub claim in JWT does not exist"`); a `NULL`
`confirmation_token`/etc. makes it find the row but then fail to scan it
(`"sql: Scan error ... converting NULL to string is unsupported"`). Set
`instance_id = '00000000-0000-0000-0000-000000000000'` and all the token
columns to `''`, not left unset — see `dev-fixture.sql`'s comment for the
full column list. A real Google-OAuth-created row never hits this since
GoTrue sets these itself; only a hand-written SQL fixture can.

**Don't run the RLS suite (below) against a stack that already has
dev-fixture.sql loaded** — `RLS-14` asserts admin sees exactly the suite's
own 4 fixture students, and it'll see dev-fixture's students too. Use a
plain `supabase db reset --local` (no fixture) before `supabase test db`.

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

## Netlify Functions

`netlify/functions/`:

| Function | Purpose |
|---|---|
| `health.mts` | Pipeline smoke test |
| `invite-user.mts` | Admin-only: invites a user by email and creates their profile in one step (see RegistrationsPage) |
| `generate-year-end-drafts.mts` | Admin-only: bulk-creates draft year-end reports for an academic year, optionally scoped to a class |
| `publish-report.mts` | Authoring tutor only: renders the report PDF (pdfkit), uploads it to the private `reports` bucket, then flips `draft → published` |
| `report-pdf.mts` | Mints a 5-minute signed URL for a report's PDF after re-checking the caller's authorization |

All use the Netlify Functions v2 API (default export, Web-standard
`Request`/`Response`) and are typechecked separately from the main app
(`npm run typecheck:functions`) since `netlify/functions/` isn't a project
reference of the root `tsconfig.json`.

The four that hold `SUPABASE_SERVICE_ROLE_KEY` share one authorization
shape, extracted into `netlify/functions/lib/callerAuth.ts`: validate the
caller's JWT with a plain anon-key client, then look their role up
*independently* with the service-role client. The service-role key
bypasses RLS entirely, so each of these owns its own authorization check
in code — the report Functions deliberately restate the `year_end_reports`
RLS rules rather than inheriting them. This matters most in
`report-pdf.mts`: a Supabase signed URL bypasses RLS once minted and the
`reports` bucket has no client-facing read policy at all, so that check is
the only gate in front of the PDF.

Pure, testable pieces live under `netlify/functions/lib/` (attendance
stats, the draft skip rules, the publish ordering, PDF rendering) and are
unit-tested in `tests/unit/reports.test.ts` — including the assertion that
a failed PDF render never reaches the status flip.

To run Functions locally (not just the Vite app — `npm run dev` alone
doesn't serve `/.netlify/functions/*`):

```bash
netlify dev   # serves the Vite app + Functions together, default http://localhost:8888
```

Point `.env` at the local Supabase stack as usual, and additionally set
`SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY` there too (server-side
Functions read `process.env` directly, not Vite's `import.meta.env`) —
use the local stack's own keys from `supabase start`'s output, not the
production ones from `netlify env:list`.

**Do not add a `config.path` export to a v2 Function that just restates its
own default route** (`/.netlify/functions/<name>`) — confirmed on
`netlify-cli` 27.1.1: declaring it, even matching the default exactly,
makes local `netlify dev` refuse to match its own declared path and 404
every request, while working fine on real deployed Netlify. Both existing
functions omit it for this reason; only add `config.path` for an actually
different custom path.

## Right to erasure (GDPR art. 17)

Deleting a student cascades to all their DB rows (`on delete cascade` on
every student-scoped table, `year_end_reports` included) — but **cascade
does not reach Supabase Storage**, so a deleted student's year-end report
PDF would survive the deletion of every row that pointed at it. Delete the
Storage object *first*, while `pdf_path` is still readable:

```sql
-- 1. find the objects to remove (run as service role / in the SQL editor)
select id, academic_year, pdf_path
from public.year_end_reports
where student_id = '<student-uuid>' and pdf_path is not null;
```

```bash
# 2. delete each pdf_path from the private `reports` bucket
curl -X DELETE "$SUPABASE_URL/storage/v1/object/reports/<pdf_path>" \
  -H "authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

```sql
-- 3. only then delete the student; the DB rows cascade from here
delete from public.students where id = '<student-uuid>';
```

Verify with `select count(*) from storage.objects where bucket_id='reports'
and name like '<student-uuid>/%';` → 0. See test-plan.md §8 and
dpia-draft.md's Article 17 row; there is no automated erasure flow yet, so
this is a manual runbook, not a feature.

## Known gaps (foundation pass — not yet built)

- **No real PPME logo asset for PWA icons.** The top nav now uses the real
  logo (`public/logo.png`), but the source file is only 135×70px, so the
  512px PWA icons (`public/icons/*.png`) are a soft ~3.7x upscale — fine as
  a placeholder, replace with a proper square/high-res (512×512+) source
  before real launch. For the same reason the year-end report PDF header is
  a typographic wordmark in the brand colours rather than the bitmap logo
  (`netlify/functions/lib/reportPdf.ts`) — swap in `doc.image()` once a
  high-res square asset exists.
- **Attendance, Yanbu'a (Milestone 1), Homework/Tugas (Milestone 2),
  Quran/Al-Quran recitation tracking (Milestone 3), Murajaah/memorization
  tracking (Milestone 4), and Year-End Curriculum Reports (Milestone 6) are
  built.** Every route in `src/App.tsx` now points at a real feature — the
  `FeaturePlaceholder` page was deleted with the last one. See the
  checklist's suggested build order for what's next — notifications/Netlify
  Functions (§4) and offline/PWA sync polish (§5) are next up, deliberately
  deferred from Milestone 1. Homework's own FR-005 (due-date reminders), the
  Quran feature's jilid/juz milestone-celebration notification, Murajaah's
  daily practice reminder (FR-006), and the year-end report's FR-007
  ("report ready" push) are all deferred for the same reason — each needs
  Netlify Scheduled Functions/webhook infra, which don't exist yet for
  anything in this project. **Publishing a report notifies nobody**;
  families see it the next time they open the Reports screen.
- **Admin enrollment UI is built** (`/admin/registrations`, `/admin/classes`,
  `/admin/students`), with two ways to register a user: invite by email
  (`invite-user.mts` — creates the account and profile together, no waiting
  on them to sign in first) or wait for them to sign in with Google and
  register them from the resulting pending-registrations list
  (`fn_pending_registrations()`, migration 008). By design, admin cannot view
  attendance/Yanbu'a/homework/Quran/Murajaah/Reports (those tabs are hidden
  for admin, and the routes themselves redirect if visited directly) — see
  `AdminRestricted.tsx`'s docstring for why this is an application-layer
  restriction, not an RLS one (RLS still grants admin full table access,
  matching the TAD's documented "Admin: ALL" policy). Still missing: no
  "tutor management" view beyond assigning tutors on the class form, no way
  to remove/deactivate an enrolled student, no CSV export.
- Bundle isn't code-split yet (single ~500KB JS chunk) — fine at this size, revisit
  once feature modules grow.
