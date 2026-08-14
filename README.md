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

Migrations live in `supabase/migrations/` (001–012, applied in order). The
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

`supabase/dev-fixture.sql` seeds a small realistic dataset (2 tutors — one
assigned to both classes, one to Kelas B only — plus admin, 2 parents,
2 classes, 4 students, 1 pending/unregistered sign-in) into a local stack — load it after migrations are applied:

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

`supabase/tests/database/rls.test.sql` implements all 27 cases from
test-plan.md §3 (RLS-01…RLS-27), plus WH-01…WH-12 for the notification
webhooks in migrations 009 and 010, plus NC-01…NC-11 for the notification
centre in migration 012 — 104 pgTAP assertions, using the standard
fixture set from §2. The NC cases assert that only the addressee reads a
notification, that **no client role can create or delete one at all**,
that a recipient may write `read_at` and nothing else (a column-level
GRANT, since RLS has no column granularity), that neither admin nor tutor
reads any, and that `TRUNCATE` — which RLS does not filter — is no longer
held by `anon`/`authenticated` on any table. The WH cases assert each trigger fires on
exactly its own event and nothing else (a re-saved roster, a re-activated
murajaah target and a re-published report must all notify nobody), that
they are silent when unconfigured, that the body carries the row id and
never the absence `reason` or the assignment title, that no client role
can read the webhook secret, and that a broken webhook path cannot fail
the write it observes. pg_net queues inside the calling transaction, so
the whole thing rolls back with everything else and never makes a real
request. RLS-22…RLS-27 cover the super-admin change (TAD
ADR-014): that an admin INSERT/UPDATE lands on every operational table, and
— the half that matters more — that those rows widen nobody else's
visibility. It runs entirely inside a transaction that's rolled
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
| `generate-year-end-drafts.mts` | Admin-only: bulk-creates draft year-end reports for an academic year, optionally scoped to a class. Triggered from the panel at the top of the admin's own Reports screen |
| `publish-report.mts` | Authoring tutor only — **not admin**, deliberately (TAD ADR-014 left this boundary where ADR-013 put it): renders the report PDF (pdfkit), uploads it to the private `reports` bucket, then flips `draft → published` |
| `report-pdf.mts` | Mints a 5-minute signed URL for a report's PDF after re-checking the caller's authorization (admin: any report; tutor: own class; parent/student 16+: own child/self, published only) |
| `push-subscribe.mts` | Stores (POST) or clears (DELETE) the caller's own Web Push subscription in `users.push_sub`. **403 for tutor and admin** — notifications are family-facing (TAD ADR-015), so no push endpoint is stored for an account nothing sends to |
| `notify-absence.mts` | Invoked by the **database webhook** on `public.attendance` (migration 009), not by the client that saved the attendance. Sends one push to the absent child's parent, in that parent's own locale |
| `notify-milestone.mts` | Webhook on `yanbua_progress` (jilid completed — applies `src/lib/yanbua.ts#isJilidComplete`, imported rather than restated) and on `murajaah_assignments.active` going true→false (surah memorized) |
| `notify-assignment.mts` | Webhook on `assignments`. The one sender that fans out across a whole class: every enrolled student's parent, plus any 16+ student themselves |
| `notify-report-ready.mts` | Webhook on `year_end_reports.status` reaching `published` (PRD FR-007). Deliberately not called from inside `publish-report`, so a push failure can never affect whether a report published |
| `send-murajaah-reminders.mts` | **Scheduled**, hourly, acting in the 18:00 Europe/Amsterdam hour (PRD FR-006). Reminds a family only on the last day their target's `frequency` can still be met — see `needsReminder` in `src/lib/murajaah.ts` |
| `homework-due-reminders.mts` | **Scheduled**, hourly, acting at 08:00 Europe/Amsterdam (PRD FR-005). Assignments due *tomorrow*, across each class roster, skipping students who already marked it `completed` |
| `weekly-progress-digest.mts` | **Scheduled**, hourly, acting at 08:00 on a Friday in Europe/Amsterdam. Parents of any child with activity this week; the summary itself is on the dashboard, because DPIA R6 will not have an attendance figure on a lock screen |
| `prune-notifications.mts` | **Scheduled**, hourly, acting at 03:00 Europe/Amsterdam. Deletes notification-centre rows past 90 days — DPIA R5. Its own job rather than folded into the weekly digest, because retention is an obligation and the digest is a courtesy |

All use the Netlify Functions v2 API (default export, Web-standard
`Request`/`Response`) and are typechecked separately from the main app
(`npm run typecheck:functions`) since `netlify/functions/` isn't a project
reference of the root `tsconfig.json`.

**The runtime is pinned to Node 22 and must not drop below it.**
`netlify.toml` sets `NODE_VERSION = "22"` and CI's `node-version` matches.
`@supabase/supabase-js` builds a `RealtimeClient` inside `createClient()`,
which needs a global `WebSocket` and **throws at construction** without one
— and Node only has that unflagged from 22. Every Function holding the
service-role key calls `createClient`, so a runtime below 22 takes out
every notification and every report Function at once, at the first
request rather than at build time. Nothing in the app itself would tell
you; it surfaced only when a unit test first called `serviceClient()` on
CI's then-Node-20. If you ever need to run on an older runtime, pass a
WebSocket implementation via supabase-js's `realtime.transport` option
instead of unpinning this.

The ones that hold `SUPABASE_SERVICE_ROLE_KEY` *and* have a signed-in
caller share one authorization
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

## Web Push notifications

Every **event-driven** notification is live: a tutor (or admin) records
an absence, enters Yanbu'a progress that completes a jilid, marks a
murajaah target memorized, creates an assignment, or publishes a
year-end report → a trigger on that table posts to the matching Function
→ the Function looks up who the child's family is and sends a Web Push →
the service worker shows it.

Still deferred: the four **scheduled** notifications (daily Murajaah
reminder, homework due tomorrow, weekly digest, streak resets) are
ADR-015 part 2b, and the in-app notification centre is part 3 (built,
TAD ADR-017).

The client never calls any of these. Every trigger is a database webhook,
so a notification fires for a tutor write, an admin write (ADR-014) and
any future import alike, and no write path has to remember to ask.

### VAPID keys

Generate **one pair per environment** and never commit them:

```bash
node -e "console.log(require('web-push').generateVAPIDKeys())"
```

Set in Netlify (`netlify env:set`) and in local `.env`:
`VAPID_PRIVATE_KEY` (secret), `VAPID_PUBLIC_KEY`, and
`VITE_VAPID_PUBLIC_KEY` — the same public value twice, because the
browser needs it to subscribe and only `VITE_`-prefixed vars reach the
client bundle. **Rotating the pair invalidates every stored
subscription**: every family has to re-enable notifications, silently,
so generate once per environment and keep it.

### Scheduled Functions

The three `config.schedule` Functions all run on `0 * * * *` and decide
for themselves whether it is their hour in `Europe/Amsterdam`. Netlify
cron is UTC-only, so a fixed `0 17 * * *` would be 18:00 in winter and
19:00 through the whole CEST summer term — the entire TPA summer. The
gate resolves the offset from the runtime's IANA database
(`isAmsterdamHour`), so it needs no seasonal edit and cannot drift.

Cost: 24 invocations a day each, 72 total. 23 of every 24 return before
opening a database connection.

They authenticate nothing, and are built so they do not need to — TAD
ADR-016(d). Netlify's scheduler cannot attach a shared secret, so
requiring one would mean the job never running. Instead they read
*nothing* from the request, do nothing outside their hour, return counts
rather than dedup tags, and send nothing new on a repeat run. **Do not
add a request-derived input to one of these** without revisiting that
reasoning; see also the `netlify dev` note above, where they are plain
HTTP endpoints.

### Database webhooks

The triggers live in migrations 009 and 010, so they are
version-controlled and reproduced by `supabase db reset`. What is *not*
in the migration is where to send the request, since that differs per
environment — `fn_post_webhook()` reads it from Supabase Vault at fire
time, and **does nothing at all if it is unset**. That is why a fresh
local stack, CI and the pgTAP suite never make outbound requests.

Five triggers, all through the same sender:

| Table | Fires when | Function |
|---|---|---|
| `attendance` | a row becomes `absent` | `notify-absence` |
| `yanbua_progress` | **any** entry is recorded | `notify-milestone` |
| `murajaah_assignments` | `active` goes true → false | `notify-milestone` |
| `assignments` | a row is created | `notify-assignment` |
| `year_end_reports` | `status` reaches `published` | `notify-report-ready` |

The Yanbu'a one is the odd entry and is meant to be: it fires for every
progress entry rather than only completions, because filtering in SQL
would put a second copy of the jilid-completion rule next to the real one
in `src/lib/yanbua.ts`. The Function applies the rule and exits quietly
otherwise. See the migration's own comment and the TAD's Billing section
for the invocation cost of that choice.

None of these can fail the write they observe: each trigger function
swallows its own errors (pgTAP asserts this by breaking the webhook path
and checking the write still succeeds), and pg_net sends asynchronously
after commit.

To configure an environment (Supabase SQL editor, or `psql` locally):

```sql
select vault.create_secret('https://tpa.ppmedenhaag.nl/.netlify/functions',
                           'notify_webhook_base_url');
select vault.create_secret('<same value as Netlify NOTIFY_WEBHOOK_SECRET>',
                           'notify_webhook_secret');
```

The secret authenticates the *channel* (`netlify/functions/lib/webhookAuth.ts`)
— a webhook has no signed-in caller, so `callerAuth.ts` does not apply.
It fails closed: with `NOTIFY_WEBHOOK_SECRET` unset the Function rejects
every request rather than serving them unauthenticated.

Locally, Postgres runs in Docker and `netlify dev` runs on the host, so
the base URL must be `http://host.docker.internal:8888/.netlify/functions`
— `localhost` inside the database container is the container. Confirmed
working on this stack; pg_net reaches the host fine.

**pg_net is asynchronous.** The trigger queues into
`net.http_request_queue` and a background worker sends it a moment later,
which is what keeps a slow or failing Function from ever blocking a
tutor's attendance save. Two consequences worth knowing: a rolled-back
transaction never sends (which is what lets the pgTAP suite assert on
queued requests without a network), and the Function's response is
readable afterwards in `net._http_response` — the fastest way to see why
a notification did not arrive:

```sql
select id, status_code, content from net._http_response order by id desc limit 5;
```

### Verifying it end to end

`scripts/verify-push.mjs` drives the whole pipeline with nothing stubbed
— a real Chromium, a real push subscription, a real attendance write,
the real webhook, a real push — and asserts on what the browser actually
displayed, including that the *other* family's parent received nothing.
It is not part of `npm test` (it needs Docker, the dev fixture and a
running `netlify dev`); run it by hand after touching anything in the
notification path. The file header lists the exact setup steps.

One trap it documents: Playwright's default headless shell has **no
notifications or push implementation**, so `Notification.permission` is
permanently `denied` there and every check fails for the wrong reason.
The script launches with `channel: 'chromium'` for that reason.

Also note the browser's push service (FCM for Chrome) will quietly
**throttle repeated registrations** from one host — `pushManager.subscribe()`
then never settles rather than rejecting. If a run hangs at the subscribe
step, wait a few minutes rather than hunting for a bug in the app. The
app itself bounds that wait (60s, `SUBSCRIBE_TIMEOUT_MS` in
`src/lib/push.ts`) and shows a "push service is not responding" message
instead of spinning forever. That bound was 30s until a subscription FCM
served perfectly well was measured taking **32 seconds** — so if you
lower it, you are choosing to tell families the feature is broken on a
slow day. If you raise it, raise the harness's own wait with it.

**Do not add a `config.path` export to a v2 Function that just restates its
own default route** (`/.netlify/functions/<name>`) — confirmed on
`netlify-cli` 27.1.1: declaring it, even matching the default exactly,
makes local `netlify dev` refuse to match its own declared path and 404
every request, while working fine on real deployed Netlify. Both existing
functions omit it for this reason; only add `config.path` for an actually
different custom path.

**A scheduled Function is an ordinary HTTP endpoint under `netlify dev`.**
Confirmed on `netlify-cli` 27.1.1: the three jobs with `config.schedule`
(`send-murajaah-reminders`, `homework-due-reminders`,
`weekly-progress-digest`) are listed at startup like any other function,
and `curl` reaches them at `/.netlify/functions/<name>` on both GET and
POST — despite `@netlify/functions`' own types describing a scheduled
function as "Not reachable via HTTP". The cron itself does **not** run
locally; nothing fires on its own. `netlify functions:invoke <name>`
works too and goes to the same handler.

**Whether the deployed site behaves as its own types claim is untested
here**, and should not be assumed: deploy previews on this project sit
behind Netlify's password protection, which 401s every path including
`health`, so there is no deployed environment available to curl. Someone
with access to the production site should check it once. Nothing depends
on the answer — the jobs are built for the worse case — but it is worth
knowing which one is true.

Two consequences worth knowing before you change one of these:

- Locally there is nothing in front of them. That is a stated reason
  they read *nothing* from the request and return only counts, never a
  dedup tag — a tag carries a user id and a student id (TAD ADR-016).
  Keep it that way.
- They will not do anything useful when you curl them, because 23 hours
  out of 24 the Europe/Amsterdam gate returns `{"skipped": "not 18:00
  in Europe/Amsterdam"}`. To actually exercise one, move the clock from
  outside:

  ```bash
  node scripts/invoke-scheduled.mjs send-murajaah-reminders 2026-08-14T16:00:00Z
  ```

  That bundles the Function with esbuild exactly as Netlify does, pins
  the clock and calls the handler in process. There is deliberately no
  test hook inside the Function for this.

### The notification centre

Every notification any sender produces also writes a row to
`public.notifications` (migration 012), which the bell in the top nav
opens at `/notifications`. Three things about it are easy to get wrong
if you change it:

- **Rows are written whether or not the family has push enabled.** The
  centre exists mainly *for* the families push cannot reach, so
  recording happens at the audience level and only the push half filters
  on having a subscription. `recorded` and `sent` are reported
  separately and `recorded` is normally larger; that is not a
  discrepancy.
- **Nothing about presentation is stored** — no ordering key, no
  category, no rendered sentence. A row holds `event` plus a `context`
  object and the screen builds the text at read time from the i18n copy.
  This is deliberate: the screen has never been design-reviewed (PRD
  §71), so the schema is built to survive whatever a review decides.
  Keep it that way, and put display concerns in the component.
- **Admin can read none of them.** The one place ADR-014's super admin
  stops (ADR-017(d)). There is no admin policy on the table and NC-09
  asserts it stays that way.

The client's only write is `read_at`, and that is a column-level GRANT
rather than a convention — `update (read_at)` is all `authenticated`
holds, so a recipient cannot rewrite an event on their own row.

## Roles

| Role | What it can do |
|---|---|
| `tutor` | Their assigned classes only: record attendance, homework and verdicts, Yanbu'a/Quran progress, Murajaah targets; author, edit and **publish** year-end reports for their own students |
| `parent` | Their own children only, read-only — except confirming Murajaah home practice, which only a parent can do |
| `student` (16+) | Their own record only, strictly read-only |
| `admin` | **Everything a tutor can do, on every class** (TAD ADR-014), plus the enrollment screens behind "Kelola". Two deliberate exceptions: it cannot confirm Murajaah home practice (`confirmed_by` means "the parent who watched the child recite"), and it cannot publish a year-end report (that stays with the authoring tutor) |

Admin's access has always been granted at the database layer — every table
has an `*_admin_all` policy keyed on `fn_is_admin()` (migrations 003/005).
Until ADR-014 the *application* blocked it anyway; removing that fence needed
no migration and no policy change, which is why an unchanged-green
`supabase test db` run is itself the evidence RLS was untouched.

An admin write stores the admin's own id in `tutor_id` ("who recorded this
row"), so that column no longer implies membership of `classes.tutor_ids` —
don't write code that assumes it does.

## Brand assets

The vendor-supplied logo masters (3564×1844, aspect 1.933:1) live in
`assets/brand/` in three colourways and are never served directly. Everything
derived from them is generated:

```bash
pip install Pillow                          # not a project dependency
python3 scripts/generate-brand-assets.py
```

That writes `public/logo.png` (full colour — light backgrounds, e.g. the
sign-in screen), `public/logo-white.png` (reversed — the brand-blue top bar),
the PWA icon set and favicons under `public/icons/`, and
`netlify/functions/lib/logoAsset.ts`, which inlines the reversed wordmark as
base64 for the year-end report PDF header.

Two things not to undo:

- **The square icons carry the globe mark alone**, cropped out of the
  artwork — letterboxing a 1.93:1 wordmark into a square is what made the
  previous icon set unreadable at 48px. Never stretch the wordmark square.
- **The notification badge is a transparent silhouette, not an icon.**
  `public/icons/badge-96.png` is what Android draws in the status bar, and
  Android *masks it by its alpha channel* — colours are discarded and
  whatever is opaque is repainted in the system tint. Pointing that slot at
  `icon-192.png`, which is an opaque square, renders a plain white block;
  leaving it unset makes the browser fall back to Chrome's own logo. Both
  were true on a real phone until it was tested on one. Regenerate it with
  the brand script like every other asset, and keep it monochrome.
- **The PDF header logo is inlined as base64, not shipped as a file.** A
  bundled Netlify Function resolves runtime file paths differently under
  `netlify dev` than on deployed Netlify, and that difference would only ever
  surface at publish time in production. `reportPdf.ts` also keeps the old
  typographic header as a fallback if the asset fails to decode, so a publish
  can never fail over branding (unit-tested both ways).

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

- **Attendance, Yanbu'a (Milestone 1), Homework/Tugas (Milestone 2),
  Quran/Al-Quran recitation tracking (Milestone 3), Murajaah/memorization
  tracking (Milestone 4), and Year-End Curriculum Reports (Milestone 6) are
  built.** Every route in `src/App.tsx` now points at a real feature — the
  `FeaturePlaceholder` page was deleted with the last one. See the
  checklist's suggested build order for what's next — notifications (§4)
  are largely done (below), and offline/PWA sync polish (§5) is the
  remaining piece deliberately deferred from Milestone 1. Of the feature
  FRs that were waiting on notification infrastructure, the milestone
  celebrations and the year-end report's FR-007 are now built; Homework's
  FR-005 (due-date reminders) and Murajaah's FR-006 (daily practice
  reminders) still wait on Netlify Scheduled Functions, which don't exist
  yet.
- **Notifications: everything event-driven is built** (ADR-015 parts 1
  and 2a) — absence, jilid completed, surah memorized, new homework, and
  report ready (PRD FR-007, so publishing a report *does* now notify the
  family). What remains is the four **scheduled** ones — the daily
  Murajaah reminder (FR-006), homework due tomorrow (FR-005), the weekly
  digest and streak resets — which are part 2b, plus the in-app
  notification centre and TopNav bell in part 3, held until that screen's
  design is reviewed. Notification settings live at
  `/settings/notifications`, reached from the dashboard.
- **Android and iOS push are unverified** — there is no phone available
  to this project, and test-plan §6's two mobile columns need one. The
  iOS "add to Home Screen first" path is implemented and unit-tested, but
  that is not the same as having watched a notification arrive on an
  iPhone. Desktop Chrome is verified for real (`scripts/verify-push.mjs`).
- **Admin enrollment UI is built** (`/admin/registrations`, `/admin/classes`,
  `/admin/students`), with two ways to register a user: invite by email
  (`invite-user.mts` — creates the account and profile together, no waiting
  on them to sign in first) or wait for them to sign in with Google and
  register them from the resulting pending-registrations list
  (`fn_pending_registrations()`, migration 008). These screens sit behind the
  single "Kelola" entry point (dashboard tile + a sixth desktop tab) and are
  still admin-only (`RequireAdmin.tsx`). Still missing: no "tutor management"
  view beyond assigning tutors on the class form, no way to remove/deactivate
  an enrolled student, no CSV export.
- Bundle isn't code-split yet (single ~500KB JS chunk) — fine at this size, revisit
  once feature modules grow.
