# Test Plan — TPA PPME Den Haag

*Version 1.0 draft · Stack: Vitest (unit), Supabase CLI + pgTAP or SQL scripts (RLS), Playwright (E2E). CI: Netlify build + GitHub Actions.*

## 1. Scope & priorities

Priority order reflects risk, not feature order:

1. **RLS isolation** (children's data — a failure here is a GDPR incident, not a bug)
2. **Core flows** (attendance, progress recording — daily-use correctness)
3. **Streak & milestone logic** (edge-case-heavy)
4. **Notifications** (cross-platform quirks, silent failures)
5. **Offline/PWA behavior** (deferred if offline-writes descoped from MVP)
6. **i18n completeness**

Out of scope for MVP testing: load/performance (200 users on Supabase free tier is trivial), penetration testing (basic OWASP checklist only).

## 2. Environments

| Env | Purpose | Data |
|---|---|---|
| Local (Supabase CLI) | Unit + RLS tests, migration validation (`supabase db reset` must run 001→004 cleanly) | Synthetic fixtures only |
| Netlify Preview + Supabase branch/staging project | E2E per PR | Synthetic fixtures only |
| Production | Smoke tests post-deploy | Real data — **never** used in tests |

**Rule: no real student data in any test environment, ever.**

### Standard fixture set (used by RLS + E2E suites)

- 1 admin, 2 tutors (T1, T2), 3 parents (P1, P2, P3), 1 student account (S16, linked to P3's child). The admin is deliberately a tutor of **no** class, so any access it has comes from `fn_is_admin()` and never from class membership
- 2 classes: Class A (tutor T1), Class B (tutor T2)
- P1 has 2 children in Class A; P2 has 1 child in Class B; P3 has 1 child (16+, user_id set) in Class B
- Sessions, attendance, assignments, and progress rows for each child
- **Two dual-role people** (added with ADR-019, used by RLS-28…RLS-33): TP (`users.role = 'parent'`) and TT (`users.role = 'tutor'`) are each a tutor of Class C *and* the parent of a child in Class D. The two role values are deliberately opposite, because the point of the cases is that the column has no bearing on what they can reach. Each one's own child sits in the class the *other* teaches, so neither can reach their own child through their tutor grant — the union of the two grants is the only way either of them sees everything they are entitled to. A fourth parent P4 has children in both classes, to give each of them a classmate they must **not** be able to reach. TAP (`users.role = 'admin'`) is the same shape again with a third relationship on top — admin *and* tutor of Class C *and* parent of a child in Class D — used by RLS-34
- These rows are created inside the RLS suite itself, after RLS-14 and the NC cases, because those assert exact fixture row counts. `supabase/dev-fixture.sql` seeds the browser-facing equivalents (Ustadzah Aminah, Bapak Hasan, and the triple-role Ustadzah Laila) for manual walkthroughs

## 3. RLS test suite (highest priority)

Run as SQL scripts with `set role authenticated; set request.jwt.claims` per persona, or via pgTAP. Every test asserts **both** the positive (allowed) and negative (denied/empty) case.

| ID | Assertion |
|---|---|
| RLS-01 | P1 SELECT students → sees exactly their 2 children; P2's child absent from results |
| RLS-02 | P1 SELECT attendance/yanbua/quran/murajaah rows of P2's child → 0 rows |
| RLS-03 | T1 SELECT students → Class A only; Class B students invisible |
| RLS-04 | T1 INSERT attendance for Class B student → rejected |
| RLS-05 | T1 INSERT yanbua_progress with tutor_id ≠ auth.uid() → rejected |
| RLS-06 | S16 SELECT own attendance/progress → rows returned; sibling/classmate rows → 0 |
| RLS-07 | S16 INSERT/UPDATE on any table → rejected (read-only role) |
| RLS-08 | P1 INSERT murajaah_log for own child's assignment → allowed; for P2's child → rejected |
| RLS-09 | P1 INSERT murajaah_log with confirmed_by ≠ auth.uid() → rejected |
| RLS-10 | Any non-admin UPDATE users.role (own or others) → rejected |
| RLS-11 | Non-admin INSERT/DELETE on students → rejected (enrollment is admin-only) |
| RLS-12 | Anonymous (no JWT) SELECT on every table → 0 rows / 401 |
| RLS-13 | Duplicate murajaah_log (same assignment_id + date) → 409 unique violation |
| RLS-14 | Admin can SELECT/modify all tables |
| RLS-15 | Tutor (T1) SELECT year_end_reports for Class A student, status=draft → row returned (own class, draft visible to tutor) |
| RLS-16 | Parent (P1) SELECT year_end_reports for own child, status=draft → 0 rows (drafts must never leak to parents) |
| RLS-17 | Parent (P1) SELECT year_end_reports for own child, status=published → row returned |
| RLS-18 | Parent (P1) SELECT year_end_reports for P2's child, any status → 0 rows |
| RLS-19 | S16 SELECT own year_end_reports, status=published → row returned; status=draft → 0 rows |
| RLS-20 | T2 (not the authoring tutor, different class) SELECT/PATCH a Class A report → rejected |
| RLS-21 | Non-service-role client attempts to read/write `storage.objects` in the `reports` bucket directly → rejected (no client-facing policy exists) |
| RLS-22 | Admin INSERT lands on every operational table — `sessions`, `attendance`, `assignments`, `assignment_status`, `yanbua_progress`, `quran_progress`, `murajaah_assignments`, `year_end_reports` — for a class it is *not* a tutor of |
| RLS-23 | Admin UPDATE lands on rows it did not create, including another tutor's report narrative/grades (`yer_tutor_rw`'s `tutor_id = auth.uid()` WITH CHECK does not constrain `yer_admin_all`) |
| RLS-24 | An admin-recorded row carries the admin's own id in `tutor_id`, and that id is in no class's `tutor_ids` — the column means "who recorded this", not "a tutor of this class" (TAD ADR-014(b)) |
| RLS-25 | RLS *permits* an admin `murajaah_log` INSERT (`mlog_admin_all`). The parent-only rule for home-practice confirmation is application-layer by design (ADR-014(c)) — asserted so the split between "the database allows it" and "the app does not offer it" stays visible |
| RLS-26 | Admin's new rows widen nobody else: P1 sees 0 of them for P2's child, T1 sees 0 of the Class B rows, S16 sees 0 of a classmate's, anon still sees 0 |
| RLS-27 | The non-admin write boundaries are unchanged after admin gained access: T1 cannot UPDATE an admin-created Class B attendance row, a parent still cannot INSERT `yanbua_progress` for their own child (but *does* see the admin-recorded row), a 16+ student is still read-only |
| RLS-28 | TP (tutor of Class C, parent of a child in Class D) SELECT students → **exactly** the Class C roster plus their own child; their child's classmates absent, another family absent. Their `users.role` is still `parent` and `fn_is_admin()` is false, so nothing in the result came from a role check. Classes and sessions are the same union — the one they teach and the one their child attends |
| RLS-29 | TT — the identical relationships with the opposite `users.role` (`tutor`) — sees the identically-shaped set. Cross-family: neither dual-role person can see the other's child, though both children share a class |
| RLS-30 | The union holds per operational table, not just on `students`: TP reads attendance, `yanbua_progress`, `quran_progress`, `murajaah_assignments` and `murajaah_log` for a student they teach **and** for their own child, and 0 rows for their child's classmate and for an unrelated family — the rows exist and are invisible |
| RLS-31 | **The union is not a promotion.** TP records Yanbu'a for a student in the class they teach → allowed; for their own child → rejected (the parent half is read-only). TP confirms home practice for their own child → allowed; for a student in their class → rejected (teaching does not grant a parent's confirmation) |
| RLS-32 | `year_end_reports`, the sharpest form of the same rule: TP sees the draft for a student they teach, still cannot see the draft for their **own** child, does see their own child's published report, and sees none of the classmate's at any status |
| RLS-33 | The dual-role rows widen nobody: TP sees none of the four original fixture students, P1 and T1 see none of the dual-role students, S16 still sees exactly one student row (their own), anon still sees 0 |
| RLS-34 | **The triple-role person** — `users.role = 'admin'`, tutor of one class, parent of a child in another. All four capabilities are derived independently and none excludes another: `fn_is_admin()` true, `fn_my_classes()` exactly the one class they are named in, `fn_my_children()` exactly their own child, `fn_my_student_id()` null. **And the one boundary the rest of the block does not have:** with `admin` in the union, RLS-28's "nothing more" and RLS-31/RLS-32's "not a promotion" stop holding — they see all four original fixture students, *can* record Yanbu'a for their own child, *can* confirm home practice for a student they teach, and *do* see their own child's draft report, each one the mirror of a refusal above. What keeps an admin out of the parent-only actions is application-layer (ADR-014(c), RLS-25). They still widen nobody: TP cannot see their child, anon still sees 0 |

**Gate: all RLS tests green in CI is a merge requirement for any migration change, and a launch requirement before real data entry (DPIA risk R1).**

*RLS-22…RLS-27 were added with TAD ADR-014 (admin as super admin). They test policies that already existed and were never modified, which is the point: an unchanged-green run of RLS-01…RLS-21 alongside them is the evidence that widening the application layer did not touch the database layer. 27 cases, 64 pgTAP assertions in `supabase/tests/database/rls.test.sql`.*

*RLS-28…RLS-33 were added with TAD ADR-019 (dual-role people), and for
the same reason: they test policies that already existed and were never
modified. The claim they exist to prove is that the policies are written
against relationships rather than roles, so someone who is both a tutor
and a parent gets the union of both grants and nothing more — which is
the assumption the whole dual-role change rests on, and would have
changed all of it had it been wrong. They are worth reading in pairs:
RLS-28 and RLS-29 are the same person with opposite `users.role` values
and identical results, and RLS-31 and RLS-32 are the two places the
union deliberately does **not** widen. RLS-34 was added afterwards, to
answer "is this dual-role only, or n-ary?" — the derivation is four
independent booleans and nothing caps the count at two, but that was an
inference from the absence of a constraint until this case asserted it.
It is also the one place in the block where the union is *not* bounded
by the relationships held, and it says so. 39 assertions, taking the
file to 143.*

*WH-01…WH-06 were added with TAD ADR-015 (migration 009's absence
webhook). They are not RLS assertions, but they belong to the same "what
does the database do on its own" suite: the trigger fires on every
attendance write in the product and reaches outside the database. They
assert it exists, fires on the transition into `absent` and on nothing
else (a re-saved roster must not re-notify), is completely silent in an
unconfigured environment, targets the configured URL with the configured
secret, carries the row id and **never** the absence `reason` (DPIA
R4/R6), and that no client role can execute `fn_webhook_config()` to read
the secret. pg_net queues inside the calling transaction, so a
rolled-back test can assert on what would have been sent without a
network, a listener, or anything left behind.*

*WH-07…WH-12 cover migration 010's four event triggers (ADR-015 part
2a): that the Yanbu'a trigger fires for **every** progress entry rather
than only completions — deliberately, so the completion rule has one
implementation in `src/lib/yanbua.ts` instead of a second copy in SQL —
and that the other three fire on exactly their own transition and no
other edit (re-activating a memorized murajaah target, re-publishing or
editing an already-published report). Also that the assignment title
never leaves the database in a webhook body, and that a broken webhook
path cannot fail the write it observes: `fn_post_webhook` is renamed out
from under the triggers and the writes must still succeed. Total: 93
assertions.*

### 3.1 Notification centre (NC-01…NC-11, migration 012 / ADR-017)

A notification is a message addressed to one named person, so the whole
table is a single access-control question asked from every direction.

- [x] NC-01/NC-02 — a parent sees exactly their own notifications; another family's are invisible rather than merely filtered by the app
- [x] NC-03 — a recipient can mark their own read
- [x] NC-04/NC-05 — and can change **nothing else**: rewriting `event` or `context` on their own row is refused. RLS has no column granularity, so this is a column-level GRANT (`update (read_at)`), not a policy
- [x] NC-06 — no client role can insert a notification, even addressed to themselves. A client that could would be able to put words in the TPA's mouth on another parent's screen
- [x] NC-07 — nor delete one: retention is central, so there is no path by which the record of what a family was told disappears early
- [x] NC-08 — a 16+ student reads their own
- [x] NC-09 — **an admin reads none at all**, the one place TAD ADR-014's super admin deliberately does not reach
- [x] NC-10 — nor a tutor, including for their own class
- [x] NC-11 — `TRUNCATE`, which RLS does **not** filter, is no longer held by `anon`/`authenticated` on any table. Found while checking the grants for this migration: it came from Supabase's own role bootstrap, and `set role authenticated; truncate public.attendance;` succeeded before migration 012 revoked it. Not reachable through PostgREST, which exposes no TRUNCATE — removed on least-privilege grounds rather than in response to a live route

## 4. Unit tests (Vitest)

### 4.1 Streak logic
All done as of Milestone 7 part 2b, against `computeStreak` in
`src/lib/murajaah.ts` — a pure function over log dates, since migration
011 dropped the stored `streak_count` (TAD ADR-016(a)).

- [x] Consecutive daily confirmations increment streak (1→2→3)
- [x] Gap of 1 day resets streak to 1 — specifically to **0**, not 1: a day that is over and was missed ends the run (PRD AC-003). Today being unconfirmed does *not* break it, because today is not over
- [x] `confirmed_today` boolean correct across CET/CEST midnight. Both halves now done: `amsterdamDate`/`amsterdamHour`/`isAmsterdamHour`/`amsterdamWeekday` are tested on both 2026 switchover Sundays, on a CET date and a CEST date, and across the repeated 02:00–03:00 hour in autumn; and `computeStreak` itself is tested across both switchovers plus a month and year boundary, on date strings whose arithmetic never touches the host timezone
- [x] Best-streak derivation from log history (`computeBestStreak`), including that a still-running streak counts and an unconfirmed today does not end it
- [x] **3x_week / weekly frequency:** behaviour defined first (ADR-016(a)), then tested. The unit of a streak is the period the frequency asks for — a Mon–Sun week needing three confirmations for `3x_week`, one for `weekly` — so a `3x_week` target confirmed Mon/Wed/Fri every week is a run of *weeks*, which the old day-counting trigger scored as 1
- [x] **Assignment created mid-week:** the week a target is assigned in asks only for as many confirmations as there were days to give them, never fewer than one, and weeks before the target existed are not counted
- [x] **Reminder rule** (`needsReminder`, what `send-murajaah-reminders` decides on): remind on the last day the frequency can still be met — every unconfirmed evening for `daily`, Friday-if-none/Sunday-if-two for `3x_week`, Sunday for `weekly` — and stay quiet for a family on track

### 4.2 Milestone detection
- [x] Yanbu'a entry at page == jilid page_count with mastery `lancar` → jilid-complete event fires
- [x] Same page with mastery `kurang_lancar`/`ulang` → no event
- [x] Jilid 7 completion → program-complete variant (`nextJilid` returns null)

*Implemented in `tests/unit/yanbua.test.ts`. Since ADR-015 part 2a these
same assertions cover the **notification** path too, because
`notify-milestone` imports `isJilidComplete` rather than reimplementing
it — there is one rule with two callers (the Yanbu'a screen and the
Function), not two rules to keep in step. Both branches are also
exercised live: a completing entry produces a push, and a last page at
`kurang_lancar` produces none (§6).*

### 4.2b Transactional email (TAD ADR-018)

*Implemented in `tests/unit/email.test.ts` (16 cases).* **Every test
injects a fake transport**, so the suite cannot reach a real inbox —
§1's "no real student data in any test environment, ever" extends to not
mailing real people while developing.

- [x] The Resend request is shaped correctly: endpoint, bearer key from `process.env`, JSON body, `text` omitted rather than sent empty when there is none
- [x] A missing `RESEND_API_KEY` returns `not-configured` **and attempts nothing** — the assertion that matters is that no request was made
- [x] `429` is its own outcome, with the `retry-after` hint parsed, and with a sane result when the header is missing. The free tier is 100/day, 3,000/month, 2/sec, and the per-second limit is the one a class-sized loop would hit
- [x] An API error surfaces Resend's own message (e.g. the unverified-domain 403), so the deployment prerequisite diagnoses itself
- [x] **It never throws** — a transport that explodes still resolves to a value, which is what stops a mail failure from taking down its caller
- [x] The API key never appears in a returned result
- [x] All four roles × both locales exist, each with `{{app_url}}`; the four role bodies are asserted *different* from each other, since that is the entire reason for keying by role
- [x] Every placeholder is substituted with none left behind; an unknown placeholder is left intact rather than blanked
- [x] Locale comes from the recipient and falls back to `id` rather than failing — a missing locale should send a slightly-wrong-language email, never no email
- [x] **HTML injection**: a full name containing markup is escaped in the HTML part and left readable in the plain-text part
- [x] The Islamic greeting is present in both languages, and the `Bapak/Ibu` honorific in the Indonesian parent template

**Verified live** against the local stack and the real Resend API,
without sending mail: an admin invite with no `RESEND_API_KEY` returns
`201` with `invitation_email: "not-configured"` and the user still
created; the same invite with a deliberately invalid key reaches Resend,
comes back `401 API key is invalid`, is mapped to `failed`, logged, and
the invite still returns `201`. That is the non-blocking property proven
end to end rather than argued.

**Not verified, and cannot be here:** that a real message arrives in a
real inbox, that the HTML renders acceptably in Gmail/Outlook/Apple
Mail, and that the EU region and domain verification are actually
configured. All four need the Resend account and a verified domain, and
the first two need a real recipient. Someone with the account should run
them before the first real invitation.

### 4.3 Notification payload builder

*Implemented in `tests/unit/notifications.test.ts` (20 assertions).*

- [x] Absence, new-assignment, due-tomorrow, milestone, reminder, report-ready and weekly-digest payloads render correctly in **both locales** based on recipient's `users.locale` — all eight event types are built, tested, and have a sender wired to them (TAD ADR-015 part 2b)
- [x] Payload contains first name only, no progress details (DPIA risk R6). Asserted three ways: a full name is reduced to its first token; a serialized payload contains none of a set of sample reasons, grades and positions; and — the one that will still hold when someone adds an event type in a year — every string under `notifications.push` is rejected if it interpolates any placeholder other than `{{name}}`. The builder's own signature is the primary control: it accepts no field that *could* carry a reason or a grade
- [x] Dedup tag generated per (user, event-type, **child**, date), and differs when any of the four differs. The child was added in ADR-016(f): without it, two siblings shared a tag and the browser showed one notification instead of two. Asserted both ways — two siblings get distinct tags, and a repeated run for the same child on the same day still collapses, which is what the hourly cron depends on
- [x] Known and pinned: the tag being per (user, event, date) means a parent with two children absent on one day sees one notification, not two. That is the spec's dedup unit; per-child detail belongs in the in-app list (part 3), not on a lock screen
- [x] Deep-link URLs carry no data of their own

Also tested alongside it:

- `tests/unit/push.test.ts` (10) — subscription validation (rejects non-HTTPS endpoints, missing keys, oversized values, junk), the normalization that keeps client-supplied extras out of the `jsonb` column, and the `push-subscribe` rate limiter
- `tests/unit/pushServiceWorker.test.ts` (8) — `public/push-sw.js` loaded into a VM and driven with the browser's own event shapes: it renders the payload, never re-alerts on a replaced notification, still shows *something* when the payload is missing or unparseable (otherwise Android substitutes its own "site updated in the background" notice), and routes a click to an already-open tab rather than opening a second one
- `tests/unit/pushCapability.test.ts` (13) — platform detection, including the iOS branch this project cannot verify on hardware (see §6)
- `tests/unit/notifyStudent.test.ts` (13) — **who receives what**, the highest-risk logic in the feature. A two-family class roster must resolve each child to their own parent and no one else; the 16+ student is added only for a "family" audience; tutor and admin are never recipients; an account with no usable subscription is skipped without dropping the rest of the roster. Plus the fan-out dispatch: one payload per recipient in that recipient's own locale, a dead subscription cleared without costing anyone else their notification, a failed send not mistaken for an expired one, and delivery bounded to a fixed concurrency — none of which can be produced on demand against a real push service, which is why they are injected here rather than left to the live run

### 4.4 Year-end report generation
- `generate-year-end-drafts` computes `attendance_present/absent/late` and `attendance_rate` that exactly match a hand-computed value from fixture attendance rows for the academic year window
- Re-running for an academic year that already has drafts/reports for a student does not create duplicates (unique constraint respected; function reports `skipped_existing` count)
- `publish-report`: status only flips to `published` after successful PDF generation; a simulated PDF-generation failure leaves status as `draft` (no partial state)
- `publish-report` on an already-published report (post-edit regeneration case) overwrites the existing `pdf_path` rather than creating a second object
- PDF content smoke test: generated PDF contains the student's name, academic year, attendance rate, and all three subject grades (basic text-extraction check, not visual regression)
- **Header logo**: with the inlined brand asset present, the header wordmark is *drawn* (so "PPME Den Haag" does not appear as extractable text); with the asset missing (`logo: null`) or corrupt (a non-PNG Buffer), the render falls back to the typographic header and still succeeds — a publish must never fail over branding
- **Admin edit vs. stale PDF (ADR-014(e))**: an admin may PATCH a published report's narrative/grades but `publish-report` returns 403 for admin, so the stored PDF keeps the pre-edit text until the authoring tutor re-publishes. Asserted live against `netlify dev`: edit → fetch the signed URL → the object does *not* contain the new text → tutor re-publishes → the same object now does, with `published_at` preserved and still exactly one object in the bucket. The UI counterpart (publish button hidden for admin, "the PDF will not update until *[tutor]* re-publishes" notice shown) is covered in the §5 click-through

*Implemented in `tests/unit/reports.test.ts`. Two notes for anyone extending these: the publish ordering is tested through `publishReportFlow`'s injected dependencies (a `renderPdf`/`uploadPdf` that throws must leave `markPublished` uncalled), which is why that ordering lives in its own module rather than inline in the Function; and the smoke test renders with `compress: false` and decodes pdfkit's hex `TJ` runs, since a plain substring search over a normal (FlateDecode) PDF finds only the `/Info` metadata.*

### 4.5 Capability derivation (TAD ADR-019)

Implemented in `tests/unit/capabilities.test.ts`, against
`src/lib/capabilities.ts`. Half of these test the *queries* rather than
their results, using a faked supabase client that records what was
asked, because the defect ADR-019 fixes was a query that asked a wider
question than the screen meant — a result-only test would have passed on
the broken version.

- [x] `familyLinkFilter` asks for **both** family links (`parent_id.eq` and `user_id.eq`). The second is a 16+ self-login student's only link to their own record, and dropping it empties every screen they have
- [x] …and refuses anything that is not a UUID. PostgREST's `or=` takes a filter *expression* as a string, so a value containing a comma would add a disjunct rather than be compared against
- [x] `deriveCapabilities` for each single-role person — a parent of two, a tutor of one class, a 16+ student (whose own row's `parent_id` is their parent's id, so appearing in a `students` row must not read as parenthood) — and for an admin, with and without a child of their own
- [x] …for the dual-role person: the union of both capabilities, from a `users.role` of `parent`, exactly as RLS-28 does it
- [x] …and a `role='tutor'` account an admin has not yet put in a class is **not** a tutor of any class. This is the case that makes swapping the existing role checks for capabilities a behaviour change rather than a refactor
- [x] `fetchFamilyLinks` applies the relationship filter, selects both link columns, and rethrows a Postgrest error instead of reporting an empty family (a swallowed error here is indistinguishable on screen from "you have no children")
- [x] `fetchTutorClassCount` asks whether the caller is in `tutor_ids`, counting without fetching rows — not "how many classes RLS returns", which for a parent is their children's classes and for an admin is all of them
- [x] `fetchTaughtClasses` filters on `tutor_ids` for a tutor and returns **every** class for an admin, who is in no `tutor_ids` array and would otherwise get an empty picker on every recording screen

## 5. E2E flows (Playwright)

Run against Preview deploys with fixture data; auth mocked via Supabase test JWTs (bypasses live Google OAuth — OAuth itself covered once in a manual smoke test).

| ID | Flow | Persona |
|---|---|---|
| E2E-01 | Mark attendance for full class (mixed statuses) → submit → counters update → parent sees status | Tutor → Parent |
| E2E-02 | Create assignment → appears for class → parent + student views show it → tutor marks completed | Tutor → Parent → Student |
| E2E-03 | Record Yanbu'a progress → history timeline updates → jilid completion triggers milestone card | Tutor → Parent |
| E2E-04 | Record Quran tilawah with quality rating → position card updates | Tutor → Parent |
| E2E-05 | Parent confirms murajaah → streak increments → duplicate confirm same day blocked with friendly error | Parent |
| E2E-06 | 16+ student logs in → sees only own data across all 5 tabs → no write controls rendered | Student |
| E2E-07 | Language toggle ID↔NL → all visible strings switch, Arabic terms unchanged | All |
| E2E-08 | Unregistered Google account signs in → sees "contact admin" screen, no data | — |
| E2E-09 | Admin generates drafts for a class → tutor sees draft list → tutor writes narrative + sets 3 subject grades → publishes → parent receives notification and can view + download PDF; student (S16) can independently view + download the same report | Admin → Tutor → Parent → Student |
| E2E-10 | Tutor edits a published report's narrative → re-publish → PDF updates (old download link still resolves but now serves the new content, per FR-006's single-current-version model) | Tutor → Parent |
| E2E-11 | Admin opens each of the 6 feature tabs on a class it does not tutor → records attendance / progress / a homework verdict → the affected family sees the change in their own view, and no other family does (TAD ADR-014) | Admin → Parent |
| E2E-12 | Admin opens a draft report, edits narrative + grades, saves; no publish button is offered and the "only *[tutor]* can publish this" notice is shown. On a *published* report the notice instead warns the PDF will not update until the authoring tutor re-publishes | Admin |
| E2E-13 | Admin's bottom nav is the same five operational tabs as every other role (never the enrollment set), "Kelola" reaches `/admin/*`, and a non-admin visiting `/admin` or `/admin/classes` is redirected home | Admin, Tutor |

## 6. Notification & PWA test matrix (manual, real devices)

| Case | Android Chrome | iOS Safari (16.4+, installed to home screen) | Desktop Chrome |
|---|---|---|---|
| Permission prompt & subscribe | ☑ | ☐ | ☑ |
| Notification shows the PPME mark, not a white block or Chrome's logo | ☐ | ☐ | ☑ |
| Absence push received | ☑ | ☐ | ☑ |
| Milestone push received | ☐ | ☐ | ☑ |
| New-homework push received (class fan-out) | ☐ | ☐ | ☑ |
| Report-ready push received (parent + 16+ student) | ☐ | ☐ | ☑ |
| Scheduled Murajaah reminder at 18:00 local (check after DST switch too) | ☐ | ☐ | ☑ |
| Scheduled homework-due reminder at 08:00 local | ☐ | ☐ | ☑ |
| Weekly digest, Friday 08:00 local, and the dashboard summary it links to | ☐ | ☐ | ☑ |
| Two children absent → two notifications, one per child (ADR-016(f)) | ☐ | ☐ | ☑ |
| Tapping a push opens the app on the right screen | ☐ | ☐ | ☑ |
| Notification centre lists the same events, with the in-app detail | ☐ | ☐ | ☑ |
| Bell badge shows the unread count and clears on opening the centre | ☐ | ☐ | ☑ |
| Push switched off → centre still fills (the case the centre exists for) | ☐ | ☐ | ☑ |
| Dedup: same event twice → one notification | ☐ | ☐ | ☑ |
| iOS not-installed state → graceful explanation, no broken prompt | — | ☐ | — |
| App installable (manifest valid, icons 192/512/maskable) | ☐ | ☐ | ☐ |
| **Installed** PWA: notification is attributed to "TPA PPME Den Haag", not to Chrome | ☐ | ☐ | n/a |
| Offline: app shell loads, cached data visible, clear offline banner | ☐ | ☐ | ☐ |
| Offline write-queue (if in scope): attendance recorded offline syncs once online; double-submit on two devices resolves without data loss | ☐ | ☐ | — |

**Two Android rows are now ticked, from a real device.** A reviewer with an
Android phone ran the permission prompt, subscribed, and received a real
absence push over a local HTTPS origin (a LAN cert, so the origin is a
secure context — plain `http://<lan-ip>` is not, and neither the service
worker nor `crypto.subtle` is available there). That run is also what
caught the notification badge: Android masks the badge slot by its alpha
channel, so the opaque `icon-192.png` it pointed at rendered as a white
block, and where the browser fell back it showed Chrome's own logo. Fixed
with a transparent silhouette (`icons/badge-96.png`); **the fix itself is
not yet confirmed on the device**, so that row stays unticked until it is.

**The rest of Android, and all of iOS Safari, are still unverified, and are
not being recorded as anything else.** No physical Android or iOS device is available to this
project, and both columns need one — iOS especially, since its whole point
is behaviour that only appears after "Add to Home Screen", which cannot be
emulated. Someone with a phone needs to run those two columns before
launch. What *is* known about iOS is that the app detects an iPhone in a
Safari tab and shows the install explanation rather than a broken prompt
(§4.3, `pushCapability.test.ts`) — that is the code path being right, not
the platform being tested.

**Desktop Chrome is genuinely run**, not inspected: `scripts/verify-push.mjs`
drives three real Chromium profiles (a parent with two children in one class,
a second family in the same class, and a 16+ student with their own account)
against a real push service, and asserts on what each browser displayed. 130
checks, currently all passing (63 before part 2b, 104 before part 3).
Beyond the ticked rows above it also covers:

- the subscription is stored, with exactly the three fields we use
- **cross-family isolation live** — the other parent's browser received nothing (§1's highest-risk property). Checked on every event type, and hardest on the class fan-out: one assignment notifies both families in the class, each naming only their own child
- **the "family" audience**: a published report reaches the parent *and* the 16+ student, as two separate deliveries with their own tags
- the milestone rules behave the same server-side as on screen: a completing entry notifies, a mid-jilid entry and a last page still needing repetition do not, and re-activating a memorized murajaah target notifies nobody
- a draft report notifies nobody; publishing notifies once; re-publishing or editing a published report notifies nobody again
- the body renders in the *recipient's* locale (verified in both `id` and `nl`)
- DPIA R6 live: an absence carrying a reason (`demam tinggi` / `griep`) produces a payload with no trace of it, and neither the jilid number, the surah name nor the assignment title reaches a lock screen
- re-saving an already-absent roster notifies nobody a second time
- unsubscribe clears `users.push_sub`, and a later absence then produces nothing at all
- zero console errors and zero failed requests, for both parents, the 16+ student, tutor and admin
- non-recipient roles (tutor, admin) are told plainly that they receive nothing, and are offered no toggle
- endpoint authorization: `push-subscribe` 403s a tutor and an admin, 400s a non-HTTPS endpoint and junk, 401s without a session; `notify-absence` 401s a missing or wrong webhook secret and 405s a GET
- **two children, two notifications** — a parent whose children are both absent receives one notification per child, on distinct tags. This is the regression ADR-016(f) fixed: keyed without the child, the second replaced the first and the parent was told about one of them
- **the three scheduled Functions, driven at a chosen instant** by `scripts/invoke-scheduled.mjs`, which pins the clock from outside the process (there is deliberately no test hook inside the Function). For each: the Europe/Amsterdam gate opens at 18:00 local on a **CET** date and at 18:00 local on a **CEST** date — an hour apart in UTC — and the same 17:00 UTC that is 18:00 in winter is correctly refused as 19:00 in summer; the **second, idempotent run** reports the same sends and adds no notification; a family already on track, a morning with nothing due, and a week with no activity each send nothing; a student who has marked homework `completed` drops out of the run; the Friday digest refuses a Thursday and refuses 09:00
- **the in-app notification centre** (ADR-017): every event above also leaves a row; every row belongs to a child of that family and no other; the centre carries the detail the lock screen may not — the jilid number, the surah, the assignment title and deadline — while the child's name is never stored on the row; a repeated scheduled run updates its row rather than adding a second; no tutor or admin is given a row at all; **and a family with push switched off is still recorded**, which is who the centre is for, with the sender reporting `recorded` separately from `sent`
- **the centre on screen**: the list renders in the recipient's own language, names both of a parent's children and neither of the other family's, opening it clears the unread count, the TopNav bell appears for a parent and not for a tutor, and a tutor who navigates to `/notifications` directly is told plainly that they receive none rather than shown an empty list
- **retention** (DPIA R5): `prune-notifications` deletes past the 90-day window, leaves everything inside it, reports its cutoff and count, deletes nothing on a second run, and does nothing outside its hour
- **the scheduled Functions disclose nothing to an unauthenticated caller.** They carry no shared secret — Netlify's scheduler cannot send one — and under `netlify dev` they answer plain HTTP. Asserted: a hostile POST naming another family's child gets a response containing no dedup tags and no identifiers, and the posted body is not read at all (ADR-016(d)/(e))

**One thing this could not check.** Netlify's own types describe a
deployed scheduled function as "Not reachable via HTTP". That is
unverified here and is *not* being recorded as verified: deploy previews
on this project are password-protected and 401 every path including
`health`, so there is no deployed environment available to curl. The
local answer is the opposite — they are ordinary endpoints — which is
why the jobs are built to be safe with no platform boundary at all.
Someone with production access should confirm which behaviour the live
site has.

One more thing it learned, worth knowing before trusting its output: a
`requestfailed` event is **not** the same as a failed request. The
TopNav bell fetches its unread count on every route change, and a
navigation while that is in flight produces `net::ERR_ABORTED` — normal
browser behaviour, and initially reported here as a failure on every
family's browser. The harness now separates the two and only fails on
the rest, which is what keeps the check useful for what it exists to
find: a 4xx the UI swallows.

Two things that harness learned the hard way, both written into the README:
Playwright's default headless shell has no push implementation at all
(`Notification.permission` is permanently `denied`), so it must launch
with `channel: 'chromium'`; and FCM throttles repeated registrations from
one host, after which `pushManager.subscribe()` stops settling rather than
rejecting — which is what prompted bounding that wait in the app. Part 2b
added a third: that bound must be set against FCM's real latency, not a
guess. At 30s it was rejecting subscriptions FCM went on to serve — one
was measured taking **32 seconds** — so a family on a slow day was shown
"the push service is not responding" for something that worked. It is
60s now, and the harness waits longer than the app does.

## 7. i18n completeness (automated)

- CI script asserts `id.json` and `nl.json` have identical key sets (already scripted)
- No hardcoded UI strings: lint rule / grep for literal Indonesian or Dutch text in components
- Pseudo-locale render test: no truncation at 44px tap targets with longer Dutch strings

## 8. Compliance verification (pre-launch gate)

- [ ] Right-to-erasure: deleting a fixture student cascades to all 9 related tables (incl. `year_end_reports`) — verified by row counts before/after
- [ ] Right-to-erasure also removes the student's PDF object(s) from the `reports` Storage bucket, not just the DB row. **Procedure (README → "Right to erasure"): delete the Storage object *first*, while `year_end_reports.pdf_path` can still be read, then delete the student** — `on delete cascade` reaches every table but never Storage, so doing it in the other order orphans the PDF with nothing left pointing at it. Verify with `select count(*) from storage.objects where bucket_id='reports' and name like '<student-uuid>/%'` → 0
- [ ] CSV export contains all and only the requesting parent's children's data
- [ ] Privacy policy link blocks first login until accepted
- [ ] Retention job dry-run: correctly identifies (does not yet delete) records past cutoff

## 9. Entry / exit criteria

**MVP (Milestone 1) exit:** RLS suite 100% green · E2E-01, E2E-03, E2E-07, E2E-08 green · notification matrix passed on ≥1 Android + 1 iOS device · compliance gate §8 items 1–3 done.

**GA (Milestone 5) exit:** full E2E suite green · full device matrix · §8 complete incl. retention dry-run · DPIA signed off by PPME IT team.

**Year-End Reports (Milestone 6) exit:** RLS-15 through RLS-21 green · E2E-09 and E2E-10 green · §4.4 unit tests green · PDF Storage erasure step (§8) verified · at least one real tutor has produced and published one report as a dry run before the actual academic year-end rollout.
